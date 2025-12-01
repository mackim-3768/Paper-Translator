from openai import OpenAI

from app.config import settings


class LLMClient:
    """LLM 번역 클라이언트.

    환경 변수 OPENAI_API_KEY 를 사용해 인증한다.
    """

    def __init__(self) -> None:
        self._client = OpenAI()

    def translate_chunk(self, text: str) -> str:
        system_prompt = (
            "You are a professional academic translator. "
            "Translate English into Korean. "
            "Do not summarize, do not add explanations, keep structure. "
            "Translate as literally as possible while keeping grammar natural."
        )

        resp = self._client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": text},
            ],
            temperature=0.1,
        )

        content = resp.choices[0].message.content
        return content or ""
