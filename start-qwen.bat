@echo off
echo Starting Qwen model server...
"D:\LLAMA\llama.cpp\llama-server.exe" -m "E:\GGUF_MODELS\Qwen3.5-35B-A3B-UD-Q6_K_XL.gguf" --host 0.0.0.0 --port 8000 -c 72000 -ngl 99 --n-cpu-moe 30 --chat-template-kwargs "{\"enable_thinking\": false}"
pause
