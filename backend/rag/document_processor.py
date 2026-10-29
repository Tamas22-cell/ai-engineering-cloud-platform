from rag.pdf_loader import extract_pdf_text
from rag.text_splitter import split_document_pages


def process_pdf(
    file_path: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[dict]:
    """Extract and split PDF text while preserving page metadata."""
    pages = extract_pdf_text(file_path)

    return split_document_pages(
        pages,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
