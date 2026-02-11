FROM node:20-alpine

WORKDIR /app

# Copy everything including node_modules
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
