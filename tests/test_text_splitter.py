import pytest

from rag.text_splitter import split_document_pages


def test_text_splitter_preserves_metadata():
    pages = [{
        "source": "document.pdf",
        "page": 2,
        "text": "Python and LangGraph are useful for AI engineering. " * 20,
    }]

    chunks = split_document_pages(
        pages, chunk_size=100, chunk_overlap=20
    )

    assert len(chunks) > 1
    assert all(chunk["source"] == "document.pdf" for chunk in chunks)
    assert all(chunk["page"] == 2 for chunk in chunks)
    assert all(len(chunk["text"]) <= 100 for chunk in chunks)


def test_text_splitter_empty_pages():
    assert split_document_pages([]) == []


def test_text_splitter_invalid_settings():
    with pytest.raises(ValueError):
        split_document_pages([], chunk_size=0)

    with pytest.raises(ValueError):
        split_document_pages(
            [], chunk_size=100, chunk_overlap=100
        )


def test_text_splitter_chunk_numbers():
    pages = [{
        "source": "test.pdf",
        "page": 1,
        "text": "AI engineering with LangGraph. " * 15,
    }]

    chunks = split_document_pages(
        pages, chunk_size=80, chunk_overlap=10
    )

    assert [c["chunk"] for c in chunks] == list(
        range(1, len(chunks) + 1)
    )
