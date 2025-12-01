## 0. 목표 정리 (우리가 만들 서비스)

**기능 목표**

1. 사용자가 **논문 PDF 업로드**
2. 서버에서

   * PDF 텍스트 + 섹션/레이아웃 구조 추출
   * OpenAI API(or 다른 LLM)로 **영→한 번역** 수행 (글로벌 glossary를 활용해 주요 용어를 일관되게 번역)
   * 원본 PDF의 **레이아웃/서식(다단, 줄바꿈, 폰트/크기, 컬럼/각주 위치 등)**을 최대한 보존하면서 번역 결과를 **새 PDF로 렌더링**
3. 사용자는 **번역된 PDF 다운로드**

**비기능 목표**

* 긴 논문도 처리가 가능하도록 **청크 단위 번역 + 비동기 처리**
* 나중에 확장 가능 (요약, 하이라이트, 용어집 등)
* Dev/Prod 분리 가능하도록 구조 분명하게

## 세부 설계 문서

- [아키텍처 및 설계 보완 포인트](./section/architecture.md)
- [성능 및 운영 리스크](./section/operations.md)
- [보안 및 프라이버시 리스크](./section/security.md)
- [구현 및 환경설정 보완 포인트](./section/implementation.md)

---

## 1. 전체 아키텍처 그림 (논리 구조)

### 1-1. 레이어 구조

1. **Presentation Layer (Web/API)**

   * FastAPI (또는 Flask) 기반
   * 엔드포인트:

     * `POST /upload` : PDF 업로드 → 번역 Job 생성
     * `GET /status/{job_id}` : 진행 상태 조회
     * `GET /download/{job_id}` : 번역 PDF 다운로드
   * 간단한 HTML 업로드 폼 or React/Next.js 붙이는 것도 가능

2. **Application / Service Layer**

   * `TranslationService`

     * PDF → 텍스트/구조 추출
     * 텍스트 청크 분할
     * LLM 번역 요청
     * 번역 결과 조립
   * `PDFService`

     * 번역된 구조 → 새 PDF 렌더링

3. **Infrastructure Layer**

   * **LLMClient** (OpenAI, DeepL 등 래핑)
   * **PDFParser** (PyMuPDF / pdfplumber)
   * **PDFGenerator** (ReportLab / WeasyPrint / pdfkit)
   * **Storage**

     * 원본/번역 PDF 임시 저장 (local fs or S3)
   * **Job Queue**

     * Celery/RQ + Redis 로 비동기 처리 (긴 논문 대비)

---

## 2. 기술 스택 제안 (Python 기준)

### 2-1. 웹/API

* **FastAPI**

  * 타입 힌트 잘 맞고, async 지원
  * Swagger UI 자동 생성이라 테스트 편함

### 2-2. PDF 파싱 & 생성

* **파싱 후보**

  * `PyMuPDF (fitz)` : 레이아웃/폰트/위치까지 뽑기 좋음
  * `pdfplumber` : 텍스트 추출 간단, 표 뽑기 좋음

* **생성 후보**

  * `reportlab` : 코드 기반 PDF 생성 (레이아웃 직접 제어)
  * or `HTML + WeasyPrint`:

    * 번역 결과를 HTML 템플릿으로 만들고
    * CSS 입혀서 PDF로 변환 (레이아웃 설계 용이)

개인적으로:

* **파싱: PyMuPDF**
* **생성: HTML 템플릿 + WeasyPrint** 조합이

  * “논문 스타일 비슷하게” 유지하는 데 좀 더 유연합니다.

### 2-3. 번역 LLM

* **OpenAI Python SDK**

  * `gpt-4.1-mini`/`gpt-4.1` 정도로 번역
* 시스템 프롬프트로 “절대 요약하지 말고 직역, 설명 추가하지 말 것” 고정

---

## 3. 요청 흐름 (시퀀스)

### 3-1. 업로드 → Job 생성

1. 클라이언트 → `POST /upload`

   * multipart/form-data로 PDF 파일 업로드
2. 서버:

   * 파일을 `/data/original/{job_id}.pdf` 같은 경로에 저장
   * DB or Redis에 job 레코드 생성 (`PENDING`)
   * Celery/RQ로 **비동기 작업 enqueue**

     * `translate_paper(job_id)` 호출
   * 응답: `{job_id: "uuid-xxx"}`

---

### 3-2. 비동기 번역 Job

`translate_paper(job_id)` 내부 로직:

1. **원본 PDF 로드**

   * `PDFParser`로 페이지별 텍스트/구조 추출
   * 구조 예시 (간단한 Python dict):

   ```python
   [
     {
       "page": 1,
       "blocks": [
         {"type": "title", "text": "..."},
         {"type": "heading", "level": 1, "text": "..."},
         {"type": "paragraph", "text": "..."},
         ...
       ],
     },
     ...
   ]
   ```

2. **번역 대상 텍스트 리스트 업**

   * block 단위로 번역할 string 모으기
   * 너무 길면 LLM 토큰 한계 넘으므로,

     * **문단/섹션 단위로 chunking**
     * 혹은 일정 글자 수 기준으로 자르기

3. **LLM 번역 호출 루프**

   ```python
   def translate_chunk(text: str) -> str:
       system_prompt = (
           "You are a professional academic translator. "
           "Translate English into Korean. "
           "Do not summarize, do not add explanations, keep structure. "
           "Translate as literally as possible while keeping grammar natural."
       )
       resp = client.chat.completions.create(
           model="gpt-4.1-mini",
           messages=[
               {"role": "system", "content": system_prompt},
               {"role": "user", "content": text}
           ]
       )
       return resp.choices[0].message.content
   ```

   * 각 block 또는 chunk 마다 `translate_chunk` 실행
   * 번역된 텍스트를 원래 block 구조에 다시 매핑

4. **새 문서 구조 생성 (Korean version)**

   ```python
   translated_doc = [
       {
           "page": 1,
           "blocks": [
               {"type": "title", "text": "번역된 제목..."},
               {"type": "heading", "level": 1, "text": "번역된 섹션 제목..."},
               {"type": "paragraph", "text": "번역된 본문..."},
           ],
       },
       ...
   ]
   ```

5. **PDF 생성**

   * 옵션 A: HTML 템플릿

     ```python
     # pseudo-code
     html = render_template("translated_paper.html", doc=translated_doc)
     pdf_bytes = weasyprint.HTML(string=html).write_pdf()
     ```

   * 옵션 B: ReportLab로 직접 종이 좌표 찍기

6. `translated_{job_id}.pdf` 저장

   * `/data/translated/{job_id}.pdf`
   * job 상태를 `COMPLETED`로 업데이트

---

### 3-3. 상태 조회 & 다운로드

* `GET /status/{job_id}`

  * DB/Redis에서 status 가져와서 `{status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"}` 반환

* `GET /download/{job_id}`

  * 상태가 `COMPLETED` 일 때
  * FastAPI `FileResponse`로 `/data/translated/{job_id}.pdf` 전송

---

## 4. 디렉터리 구조 예시

```bash
paper-translator/
├─ app/
│  ├─ main.py              # FastAPI 엔트리
│  ├─ api/
│  │   ├─ routes.py        # /upload, /status, /download
│  ├─ services/
│  │   ├─ translation_service.py
│  │   ├─ pdf_service.py
│  ├─ infra/
│  │   ├─ pdf_parser.py    # PyMuPDF 기반
│  │   ├─ pdf_generator.py # WeasyPrint or ReportLab
│  │   ├─ llm_client.py    # OpenAI 래퍼
│  │   ├─ storage.py       # 파일 경로/저장 관리
│  │   ├─ jobs.py          # Celery/RQ task 정의
│  ├─ models/
│  │   ├─ job.py           # Job 상태, ID 등
│  └─ templates/
│      ├─ upload.html
│      └─ translated_paper.html
├─ worker/
│  └─ worker.py            # Celery/RQ 워커 실행 스크립트
├─ data/
│  ├─ original/
│  └─ translated/
├─ requirements.txt
└─ README.md
```

---

## 5. 최소 FastAPI 스켈레톤 (감 잡기용)

```python
# app/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
import uuid
from .infra.storage import save_original_pdf, get_translated_pdf_path
from .infra.jobs import enqueue_translate_job, get_job_status

app = FastAPI()

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="PDF만 업로드 가능합니다.")
    job_id = str(uuid.uuid4())
    await save_original_pdf(job_id, file)
    enqueue_translate_job(job_id)
    return {"job_id": job_id}

@app.get("/status/{job_id}")
def status(job_id: str):
    status = get_job_status(job_id)
    if not status:
        raise HTTPException(status_code=404, detail="존재하지 않는 job_id")
    return {"job_id": job_id, "status": status}

@app.get("/download/{job_id}")
def download(job_id: str):
    path = get_translated_pdf_path(job_id)
    if not path:
        raise HTTPException(status_code=404, detail="아직 번역이 완료되지 않았거나 없는 job입니다.")
    return FileResponse(path, filename=f"translated_{job_id}.pdf")
```

이 밑에:

* `enqueue_translate_job` 내부에서 Celery task 호출 → `TranslationService.translate_paper(job_id)` 실행
* `TranslationService` 안에서 PDF 파싱 + LLM 번역 + PDF 생성까지 순차 처리

---

## 6. 정리

* MyGPT 안에서 하려니 제약 많아서 빡치셨을 텐데,
* Python으로 직접 만들면 구조는 위처럼:

> **FastAPI(API) + Celery(비동기) + PyMuPDF(파싱) + WeasyPrint/ReportLab(PDF 생성) + OpenAI(번역)**

이 조합으로 가면 확장성/관리성 둘 다 잡을 수 있습니다.