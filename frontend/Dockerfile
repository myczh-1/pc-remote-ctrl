# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS deps
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

FROM deps AS build
COPY frontend .
ARG VITE_HOME_GRPCWEB_URL=/api
ARG VITE_CLOUD_GRPCWEB_URL=/cloud
ENV VITE_HOME_GRPCWEB_URL=${VITE_HOME_GRPCWEB_URL}
ENV VITE_CLOUD_GRPCWEB_URL=${VITE_CLOUD_GRPCWEB_URL}
RUN npm run build

FROM nginx:1.27-alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist .
COPY frontend/docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENV HOME_BACKEND_URL= \
    CLOUD_GATEWAY_URL=
EXPOSE 80
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
