import io

from pypdf import PdfReader

from rag.chunk_repository import save_document_chunks
from rag.embedding_service import EmbeddingService
from rag.text_splitter import split_document_pages
from rag.document_repository import get_user_document


async def index_stored_pdf(
    db,
    user_id: str,
    document_id: str,
    embedding_service=None,
) -> int:
    """Index a stored PDF belonging to the authenticated user."""

    document = await get_user_document(
        db, user_id, document_id
    )

    if document is None:
        raise ValueError("Document not found")

    reader = PdfReader(io.BytesIO(document.file_data))

    pages = []

    for number, page in enumerate(reader.pages, start=1):
        text = (page.extract_text() or "").strip()

        if text:
            pages.append({
                "source": document.filename,
                "page": number,
                "text": text,
            })

    chunks = split_document_pages(pages)

    if not chunks:
        raise ValueError("PDF contains no extractable text")

    service = (
        embedding_service
        if embedding_service is not None
        else EmbeddingService()
    )

    embeddings = await service.embed_texts(
        [chunk["text"] for chunk in chunks]
    )

    return await save_document_chunks(
        db=db,
        user_id=user_id,
        document_id=document_id,
        chunks=chunks,
        embeddings=embeddings,
    )
