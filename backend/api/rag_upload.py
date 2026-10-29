import hashlib
import io
from pathlib import PurePath

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from models.document import Document

router = APIRouter(prefix="/rag", tags=["RAG"])

MAX_PDF_SIZE = 10 * 1024 * 1024


@router.post("/upload", status_code=201)
async def upload_pdf(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filename = (file.filename or "").replace("\\", "/").split("/")[-1]

    if not filename or len(filename) > 255 or not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Invalid PDF filename")

    data = await file.read(MAX_PDF_SIZE + 1)

    if len(data) > MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="PDF exceeds 10 MB limit")

    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Invalid PDF format")

    try:
        reader = PdfReader(io.BytesIO(data), strict=True)
        page_count = len(reader.pages)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or unsupported PDF")

    document = Document(
        user_id=str(user.id),
        filename=filename,
        content_type="application/pdf",
        file_size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        file_data=data,
    )

    db.add(document)
    await db.commit()
    await db.refresh(document)

    return {
        "document_id": document.id,
        "filename": document.filename,
        "size": document.file_size,
        "pages": page_count,
        "status": "stored",
    }
