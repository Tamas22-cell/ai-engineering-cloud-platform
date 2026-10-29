from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.document import Document


async def get_user_document(
    db: AsyncSession,
    user_id: str,
    document_id: str,
) -> Document | None:
    """Return a document only when it belongs to the user."""

    statement = select(Document).where(
        Document.id == document_id,
        Document.user_id == user_id,
    )

    result = await db.execute(statement)
    return result.scalar_one_or_none()


async def list_user_documents(
    db: AsyncSession,
    user_id: str,
    limit: int = 50,
) -> list[Document]:
    """List documents owned by the authenticated user."""

    if not 1 <= limit <= 100:
        raise ValueError("Limit must be between 1 and 100")

    statement = (
        select(Document)
        .where(Document.user_id == user_id)
        .order_by(Document.created_at.desc())
        .limit(limit)
    )

    result = await db.execute(statement)
    return list(result.scalars().all())
