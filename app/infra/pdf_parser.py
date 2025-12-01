from pathlib import Path
from typing import List

import fitz  # PyMuPDF


class PDFParser:
    """간단한 PDF 파서.

    현재는 페이지별 전체 텍스트를 추출해서 리스트로 반환한다.
    나중에 Block/섹션 단위 파싱이 필요하면 여기서 확장한다.
    """

    def extract_pages(self, pdf_path: Path | str) -> List[str]:
        path = Path(pdf_path)
        doc = fitz.open(path)
        texts: List[str] = []
        try:
            for page in doc:
                text = page.get_text().strip()
                if text:
                    texts.append(text)
        finally:
            doc.close()
        return texts
