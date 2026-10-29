from pathlib import Path
from pypdf import PdfReader


def extract_pdf_text(file_path: str) -> list[dict]:
    """Extract text and page numbers from a PDF document."""
    path = Path(file_path)

    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {file_path}")

    if path.suffix.lower() != ".pdf":
        raise ValueError("Only PDF files are supported")

    reader = PdfReader(str(path))
    pages = []

    for page_number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""

        if text.strip():
            pages.append({
                "page": page_number,
                "text": text.strip(),
                "source": path.name,
            })

    return pages
