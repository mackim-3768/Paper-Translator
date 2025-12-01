from pathlib import Path
from textwrap import wrap
from typing import Iterable

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas


class PDFGenerator:
    """아주 단순한 텍스트 기반 PDF 생성기.

    번역된 문단 리스트를 받아 A4 단일 컬럼 텍스트 PDF로 렌더링한다.
    레이아웃 품질보다는 최소 동작에 초점을 둔다.
    """

    def generate(self, paragraphs: Iterable[str], output_path: Path | str) -> None:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        c = canvas.Canvas(str(path), pagesize=A4)
        width, height = A4

        margin = 72  # 1 inch
        x = margin
        y = height - margin
        line_height = 14
        max_chars_per_line = 80

        for para in paragraphs:
            lines = (para or "").splitlines() or [""]
            for line in lines:
                for chunk in wrap(line, max_chars_per_line) or [""]:
                    if y <= margin:
                        c.showPage()
                        y = height - margin
                    c.drawString(x, y, chunk)
                    y -= line_height
            y -= line_height  # 문단 간 간격

        c.save()
