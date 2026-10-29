from unittest.mock import patch

from rag.document_processor import process_pdf


def test_process_pdf_pipeline():
    pages = [
        {
            "source": "manual.pdf",
            "page": 1,
            "text": "LangGraph and Python AI engineering. " * 20,
        },
        {
            "source": "manual.pdf",
            "page": 2,
            "text": "RAG enables document-based AI answers. " * 20,
        },
    ]

    with patch(
        "rag.document_processor.extract_pdf_text",
        return_value=pages,
    ) as mock_loader:
        chunks = process_pdf(
            "manual.pdf",
            chunk_size=100,
            chunk_overlap=20,
        )

    mock_loader.assert_called_once_with("manual.pdf")

    assert len(chunks) > 2
    assert {chunk["page"] for chunk in chunks} == {1, 2}
    assert all(chunk["source"] == "manual.pdf" for chunk in chunks)
    assert all(len(chunk["text"]) <= 100 for chunk in chunks)


def test_process_pdf_empty_document():
    with patch(
        "rag.document_processor.extract_pdf_text",
        return_value=[],
    ):
        assert process_pdf("empty.pdf") == []
