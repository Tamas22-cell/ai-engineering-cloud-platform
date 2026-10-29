from langchain_text_splitters import RecursiveCharacterTextSplitter


def split_document_pages(
    pages: list[dict],
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> list[dict]:
    """Split PDF pages into chunks while preserving source metadata."""

    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")

    if not 0 <= chunk_overlap < chunk_size:
        raise ValueError("Invalid chunk_overlap")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    chunks = []

    for page in pages:
        for index, text in enumerate(
            splitter.split_text(page["text"]), start=1
        ):
            chunks.append({
                "source": page["source"],
                "page": page["page"],
                "chunk": index,
                "text": text,
            })

    return chunks
