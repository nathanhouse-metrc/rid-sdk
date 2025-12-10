# Copyright 2025 Metrc, LLC
# Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
# The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
# THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import base64

class RetailIdPair:
    def __init__(self, tag, index):
        self.tag = tag
        self.index = index

class Base36:
    @staticmethod
    def encode(bytes_data):
        # Correct: interpret bytes as unsigned big integer, then encode in base36
        num = int.from_bytes(bytes_data, byteorder='big', signed=False)
        return Base36._int_to_base36(num)

    @staticmethod
    def decode(base36_str):
        num = int(base36_str, 36)
        # Now figure out minimal bytes needed
        num_bytes = (num.bit_length() + 7) // 8
        return num.to_bytes(num_bytes, 'big')

    @staticmethod
    def _int_to_base36(num):
        chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        if num == 0:
            return "0"
        result = ""
        while num > 0:
            num, rem = divmod(num, 36)
            result = chars[rem] + result
        return result

class Base16:
    @staticmethod
    def encode(bytes_data):
        return bytes_data.hex()

class Varint:
    @staticmethod
    def varint_size(i):
        size = 0
        while True:
            size += 1
            if (i >> 7) == 0:
                break
            i >>= 7
        return size

    @staticmethod
    def encode(value):
        result = bytearray()
        while True:
            to_write = value & 0x7F
            value >>= 7
            if value:
                result.append(to_write | 0x80)
            else:
                result.append(to_write)
                break
        return bytes(result)

    @staticmethod
    def decode(buffer):
        shift = 0
        result = 0
        for b in buffer:
            result |= (b & 0x7F) << shift
            if (b & 0x80) == 0:
                break
            shift += 7
        return result

class RetailId:
    @staticmethod
    def hex_string_to_byte_array(hex_string):
        return bytes.fromhex(hex_string)

    @staticmethod
    def encode(tag, index, use_base64):
        tag_bytes = RetailId.hex_string_to_byte_array(tag)
        varint_bytes = Varint.encode(index)
        combined = tag_bytes + varint_bytes
        if use_base64:
            encoded_string = base64.urlsafe_b64encode(combined).decode('ascii').rstrip('=')
            return f"https://1a4.com/{encoded_string}"
        else:
            encoded_string = Base36.encode(combined)
            return f"HTTPS://1A4.COM/{encoded_string}"

    @staticmethod
    def decode(qr):
        is_base36 = qr.startswith("HTTPS://1A4.COM/")
        encoded_string = qr.split('/', 3)[-1]
        if is_base36:
            decoded_bytes = Base36.decode(encoded_string)
        else:
            padding = '=' * (-len(encoded_string) % 4)
            decoded_bytes = base64.urlsafe_b64decode(encoded_string + padding)
        tag = Base16.encode(decoded_bytes[:12])
        index = Varint.decode(decoded_bytes[12:])
        return RetailIdPair(tag, index)

def main():
    # Test case 1: Original test
    tag = "1a406030003a14e000043614"
    index = 3

    expected_base36_qr = "HTTPS://1A4.COM/5LN8CBN28KHT5PLZ6QRN"
    encoded_base36_qr = RetailId.encode(tag, index, False)
    if encoded_base36_qr != expected_base36_qr:
        raise AssertionError(f"encode failed expected {expected_base36_qr} != {encoded_base36_qr}")

    expected_base64_qr = "https://1a4.com/GkBgMAA6FOAABDYUAw"
    encoded_base64_qr = RetailId.encode(tag, index, True)
    if encoded_base64_qr != expected_base64_qr:
        raise AssertionError(f"encode failed expected {expected_base64_qr} != {encoded_base64_qr}")

    retail_id1 = RetailId.decode(expected_base36_qr)
    if retail_id1.tag != tag:
        raise AssertionError(f"decode failed expected {tag} got: {retail_id1.tag}")
    if retail_id1.index != index:
        raise AssertionError(f"decode failed expected {index} got: {retail_id1.index}")

    retail_id2 = RetailId.decode(expected_base64_qr)
    if retail_id2.tag != tag:
        raise AssertionError(f"decode failed expected {tag} got: {retail_id2.tag}")
    if retail_id2.index != index:
        raise AssertionError(f"decode failed expected {index} got: {retail_id2.index}")

    print(f"Test 1 passed: Tag: {tag}, Index: {index}")

    # Test cases matching JavaScript SDK test vectors
    test_vectors = [
        # (url, expected_tag, expected_index, description)
        ("HTTPS://1A4.COM/5LN8CBN1UB33DON9CHKX", "1a4060300020081000006609", 1, "base36 index 1"),
        ("HTTPS://1A4.COM/13TX7BMRX3IU01B9EGTPTT", "1a4060300020081000006609", 128, "base36 index 128"),
        ("HTTPS://1A4.COM/7V8S42PYJD1XC9C2UVNCD1D", "1a4060300020081000006609", 16384, "base36 index 16384"),
        ("https://1a4.com/GkBgMAAEG2AAAJKXEQ", "1a40603000041b6000009297", 17, "legacy base64"),
    ]

    for url, expected_tag, expected_index, desc in test_vectors:
        result = RetailId.decode(url)
        if result.tag != expected_tag:
            raise AssertionError(f"{desc}: tag mismatch expected {expected_tag} got {result.tag}")
        if result.index != expected_index:
            raise AssertionError(f"{desc}: index mismatch expected {expected_index} got {result.index}")

        # Round-trip test: encode and decode again
        is_base64 = url.startswith("https://")
        re_encoded = RetailId.encode(result.tag, result.index, is_base64)
        re_decoded = RetailId.decode(re_encoded)
        if re_decoded.tag != expected_tag or re_decoded.index != expected_index:
            raise AssertionError(f"{desc}: round-trip failed")

        print(f"Test passed: {desc}")

    print("All tests passed!")

if __name__ == "__main__":
    main()
