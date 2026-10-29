import pytest
from pypdf import PdfWriter

from rag.pdf_loader import extract_pdf_text


def test_pdf_file_not_found(tmp_path):
    with pytest.raises(FileNotFoundError):
        extract_pdf_text(str(tmp_path / "missing.pdf"))


def test_pdf_invalid_extension(tmp_path):
    file = tmp_path / "example.txt"
    file.write_text("test", encoding="utf-8")

    with pytest.raises(ValueError):
        extract_pdf_text(str(file))


def test_pdf_empty_page(tmp_path):
    file = tmp_path / "example.pdf"

    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)

    with file.open("wb") as output:
        writer.write(output)

    assert extract_pdf_text(str(file)) == []
