from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from app.config import settings


class Storage(ABC):
    """원본/번역 PDF 파일 저장소 추상화.

    현재는 로컬 파일 시스템 구현(LocalStorage)만 제공한다.
    """

    @abstractmethod
    def save_original(self, job_id: str, data: bytes) -> str:  # returns path
        """원본 PDF를 저장하고, 저장 경로를 문자열로 반환한다."""

    @abstractmethod
    def save_translated(self, job_id: str, data: bytes) -> str:  # returns path
        """번역된 PDF를 저장하고, 저장 경로를 문자열로 반환한다."""

    @abstractmethod
    def get_original_path(self, job_id: str) -> str:
        """원본 PDF의 예상 경로를 문자열로 반환한다.

        파일 존재 여부는 호출자가 Path.exists() 등으로 확인한다.
        """

    @abstractmethod
    def get_translated_path(self, job_id: str) -> str:
        """번역된 PDF의 예상 경로를 문자열로 반환한다."""

    @abstractmethod
    def delete_original(self, job_id: str) -> None:
        """원본 PDF를 삭제한다 (없으면 무시)."""

    @abstractmethod
    def delete_translated(self, job_id: str) -> None:
        """번역된 PDF를 삭제한다 (없으면 무시)."""


class LocalStorage(Storage):
    """로컬 디렉터리 기반 Storage 구현.

    기본 베이스 디렉터리는 settings.data_dir (기본 /data)를 사용한다.
    구조:
    - {base}/original/{job_id}.pdf
    - {base}/translated/{job_id}.pdf
    """

    def __init__(self, base_dir: Optional[str | Path] = None) -> None:
        self._base_dir = Path(base_dir or settings.data_dir)

    def _original_path(self, job_id: str) -> Path:
        return self._base_dir / "original" / f"{job_id}.pdf"

    def _translated_path(self, job_id: str) -> Path:
        return self._base_dir / "translated" / f"{job_id}.pdf"

    def save_original(self, job_id: str, data: bytes) -> str:
        path = self._original_path(job_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as f:
            f.write(data)
        return str(path)

    def save_translated(self, job_id: str, data: bytes) -> str:
        path = self._translated_path(job_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as f:
            f.write(data)
        return str(path)

    def get_original_path(self, job_id: str) -> str:
        return str(self._original_path(job_id))

    def get_translated_path(self, job_id: str) -> str:
        return str(self._translated_path(job_id))

    def delete_original(self, job_id: str) -> None:
        path = self._original_path(job_id)
        if path.exists():
            path.unlink()

    def delete_translated(self, job_id: str) -> None:
        path = self._translated_path(job_id)
        if path.exists():
            path.unlink()


def get_storage() -> Storage:
    """현재 설정에 따른 Storage 인스턴스를 반환한다.

    v1.0.0에서는 로컬 스토리지만 지원하며, 이후 S3/MinIO 등으로 확장 가능하다.
    """

    base_dir = getattr(settings, "data_dir", "/data")
    # storage_backend 설정은 향후 S3/MinIO 도입 시 분기용으로 사용한다.
    _backend = getattr(settings, "storage_backend", "local")
    return LocalStorage(base_dir=base_dir)
