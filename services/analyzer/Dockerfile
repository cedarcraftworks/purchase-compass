FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml ./
COPY compass_analyzer ./compass_analyzer
RUN pip install --no-cache-dir .
RUN useradd --create-home app
USER app
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn compass_analyzer.main:app --host 0.0.0.0 --port ${PORT}"]
