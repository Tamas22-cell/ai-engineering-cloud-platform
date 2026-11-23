FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "import scipy, qiskit; from langchain_mcp_adapters.client import MultiServerMCPClient; print('SCIPY', scipy.__version__, 'QISKIT', qiskit.__version__, 'MCP_ADAPTER_OK')"

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
