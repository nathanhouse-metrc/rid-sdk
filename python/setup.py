# Copyright 2025 Metrc, LLC
# SPDX-License-Identifier: MIT
from pathlib import Path

from setuptools import find_packages, setup

HERE = Path(__file__).parent

setup(
    name="retailid",
    version="0.10.0",
    description="Decode and encode RetailID QR codes and call the Metrc Retail ID API",
    long_description=(HERE / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    author="Metrc",
    author_email="support@metrc.com",
    license="MIT",
    url="https://github.com/MetrcID/retailid",
    project_urls={
        "Documentation": "https://github.com/MetrcID/retailid#readme",
        "Repository": "https://github.com/MetrcID/retailid",
    },
    keywords=["retailid", "qr", "barcode", "supply-chain", "tracking"],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Programming Language :: Python :: 3.13",
        "Typing :: Typed",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    package_data={"retailid": ["py.typed"]},
    python_requires=">=3.9",
    install_requires=[
        "requests>=2.31,<3",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0",
            "pytest-cov>=4.0",
            "mypy>=1.0",
            "ruff>=0.1",
            "types-requests>=2.31",
        ],
    },
)
