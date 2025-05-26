FROM denoland/deno:latest
WORKDIR /app
COPY . .
RUN deno cache backend/config/server.ts
EXPOSE 5000
EXPOSE 5001
CMD ["run", "--allow-net", "--allow-read", "backend/config/server.ts"]