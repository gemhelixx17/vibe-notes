# Notaku — image kecil, Python stdlib saja, tanpa npm.
FROM python:3.12-slim
WORKDIR /app
COPY server.py .
COPY public ./public
RUN mkdir -p /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/api/health')"
CMD ["python3", "server.py", "--port", "3000"]
