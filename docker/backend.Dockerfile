FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build

WORKDIR /workspace
COPY backend/backend.csproj backend/
RUN dotnet restore backend/backend.csproj

COPY backend/ backend/
RUN dotnet build backend/backend.csproj --configuration Release --no-restore

FROM build AS development

RUN dotnet tool install --global dotnet-ef --version 8.0.11
ENV PATH="${PATH}:/root/.dotnet/tools"
WORKDIR /workspace/backend
EXPOSE 8080

CMD ["dotnet", "run", "--no-build", "--configuration", "Release", "--no-launch-profile", "--project", "backend.csproj", "--urls", "http://0.0.0.0:8080"]

FROM build AS publish
RUN dotnet publish backend/backend.csproj --configuration Release --no-build --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
RUN mkdir -p /app/wwwroot/uploads && chown -R $APP_UID:$APP_UID /app
COPY --from=publish --chown=$APP_UID:$APP_UID /app/publish .
USER $APP_UID
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "backend.dll"]
