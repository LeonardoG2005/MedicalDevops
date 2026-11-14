# Kubernetes (GKE Autopilot) para la release 5

El coordinador del flujo multicloud corre en el cluster `medical-devops-gke`
(`us-central1`), namespace `default`. Son los manifiestos de la v2/v3 (tag
`v3.0.0`) con los cambios que pide la release 5: interruptor de caos, bandera
de ronda y OpenTelemetry hacia Grafana Cloud.

| Archivo | Que hace |
|---|---|
| `service-account.yaml` | KSA `medical-api` ligada por Workload Identity a `medical-api-gsa`. |
| `secret-provider-class.yaml` | Lee de Secret Manager la URL de la base, las URLs de los compañeros, el token del caos y las credenciales OTLP. |
| `secret-sync.yaml` | Convierte lo anterior en el Secret `medical-api-secrets`. |
| `config-map.yaml` | Variables no sensibles: version, `RESILIENCE_ENABLED` (ronda), `CHAOS_ENABLED`, OTel. |
| `deployment.yaml` | 2 replicas, probes de startup/readiness/liveness en `/health`, requests y limits, sidecar Cloud SQL Proxy. |
| `hpa.yaml` | Fijo en 2 replicas durante el experimento (min = max = 2). |
| `service.yaml` | `LoadBalancer` con la IP `34.123.58.136`. La IP es efimera: no borrar el Service. |
| `pod-monitoring.yaml` | Managed Prometheus raspa `/metrics` cada 30 s. |

## Orden de aplicacion

El workflow `deploy-gke.yml` hace esto mismo. A mano:

```bash
gcloud container clusters get-credentials medical-devops-gke --region us-central1
kubectl apply -f k8s/service-account.yaml -f k8s/secret-provider-class.yaml -f k8s/secret-sync.yaml
kubectl get secret medical-api-secrets -o jsonpath='{.data}' | jq keys
kubectl apply -f k8s/config-map.yaml -f k8s/service.yaml -f k8s/pod-monitoring.yaml -f k8s/hpa.yaml -f k8s/deployment.yaml
kubectl set image deployment/medical-documents-api medical-documents-api=<imagen por digest>
kubectl rollout status deployment/medical-documents-api --timeout=600s
```

## Cambiar de ronda

```bash
kubectl patch configmap medical-api-config --type merge -p '{"data":{"RESILIENCE_ENABLED":"true"}}'
kubectl rollout restart deployment/medical-documents-api
kubectl rollout status deployment/medical-documents-api
curl -sI http://34.123.58.136/api/v5/flujo/random | grep -i x-ronda
```

## Interruptor de emergencia

`CHAOS_ENABLED=false` en el ConfigMap y `rollout restart`: las rutas
`/internal/chaos` dejan de existir. Los fallos ya activos caducan solos por su
TTL (maximo 15 minutos) o se borran con `DELETE /internal/chaos`.

## Prerrequisitos en GCP (una sola vez)

- Secreto `medical-api-chaos-token` en Secret Manager con un valor de al menos
  16 caracteres, y el mismo valor como secreto `CHAOS_TOKEN` en GitHub.
- `medical-api-gsa` (y el principal de Workload Identity `ns/default/sa/medical-api`)
  con `roles/secretmanager.secretAccessor` sobre `medical-api-chaos-token`,
  `otel-endpoint` y `otel-headers`. Terraform lo declara en `terraform/chaos.tf`.
