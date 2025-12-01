from pathlib import Path
from typing import List

from app.infra.llm_client import LLMClient
from app.infra.pdf_generator import PDFGenerator
from app.infra.pdf_parser import PDFParser


class TranslationService:
    """PDF → 번역 → PDF 최소 파이프라인 서비스."""

    def __init__(self, max_chars_per_chunk: int = 3000) -> None:
        self._parser = PDFParser()
        self._llm = LLMClient()
        self._generator = PDFGenerator()
        self._max_chars_per_chunk = max_chars_per_chunk

    def translate_pdf(self, input_pdf: Path | str, output_pdf: Path | str) -> None:
        """PDF를 읽어 간단히 페이지 단위 텍스트로 추출 → LLM 번역 → 새 PDF 생성."""

        pages = self._parser.extract_pages(input_pdf)
        if not pages:
            # 빈 문서라도 최소한 빈 PDF는 생성
            self._generator.generate([""], output_pdf)
            return

        joined = "\n\n".join(pages)
        chunks = self._split_into_chunks(joined)

        translated_chunks: List[str] = []
        for chunk in chunks:
            translated = self._llm.translate_chunk(chunk)
            translated_chunks.append(translated)

        translated_text = "\n\n".join(translated_chunks)
        translated_paragraphs = translated_text.split("\n\n")

        self._generator.generate(translated_paragraphs, output_pdf)

    def _split_into_chunks(self, text: str) -> List[str]:
        chunks: List[str] = []
        current = []
        current_len = 0

        for part in text.split("\n\n"):
            part_len = len(part)
            if current_len + part_len > self._max_chars_per_chunk and current:
                chunks.append("\n\n".join(current))
                current = [part]
                current_len = part_len
            else:
                current.append(part)
                current_len += part_len

        if current:
            chunks.append("\n\n".join(current))

        return chunks
