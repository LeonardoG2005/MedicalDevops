# Canal de correo para las alertas del caos y del game day de seguridad.
#
# Criterio del grupo (informe del game day): una deteccion solo cuenta si la
# alerta llega a una persona; un registro que nadie lee es "senal registrada".
# Sin canal, las politicas se abren en la consola pero nadie se entera.
#
# El correo no se escribe en el repositorio: llega por la variable
# correo_alertas, que el workflow toma del secreto ALERTAS_CORREO de GitHub
# (TF_VAR_correo_alertas). Si esta vacia no se crea canal y las alertas quedan
# como antes. canal_notificacion_id (chaos.tf) sigue permitiendo usar un canal
# ya existente.

variable "correo_alertas" {
  description = "Correo que recibe las alertas de seguridad y del caos. Vacio = sin canal de correo."
  type        = string
  default     = ""
  sensitive   = true
}

resource "google_monitoring_notification_channel" "correo_alertas" {
  count        = var.correo_alertas == "" ? 0 : 1
  display_name = "Correo de alertas de Medical API (caos y seguridad)"
  type         = "email"
  labels = {
    email_address = var.correo_alertas
  }
  depends_on = [google_project_service.required]
}

locals {
  canales_alerta = compact([
    var.canal_notificacion_id,
    try(google_monitoring_notification_channel.correo_alertas[0].id, ""),
  ])
}
