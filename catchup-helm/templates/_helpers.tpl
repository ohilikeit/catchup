{{/*
커스텀 templates(litellm·exam·networkpolicy)용 헬퍼.
common-helm 의 네이밍 컨벤션(namespace = "{namespace}-{stage}")을 재현해
common-helm 으로 배포되는 web 과 같은 네임스페이스에 배치한다.
설정값은 common-helm 블록과 별개의 최상위 키 .Values.examPlatform 에서 읽는다.
*/}}

{{/* 풀 네임스페이스 = common-helm 블록의 {namespace}-{stage} */}}
{{- define "catchup.namespace" -}}
{{- $ch := index .Values "common-helm" -}}
{{- printf "%s-%s" $ch.namespace $ch.stage | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "catchup.stage" -}}
{{- (index .Values "common-helm").stage -}}
{{- end -}}

{{/*
모델명 단일 파생 — SSOT 는 examPlatform.litellm.model (예: anthropic/claude-haiku-4-5).
LiteLLM 은 exact match(model_list.model_name)이므로 exam 의 ANTHROPIC_MODEL·피커
availableModels 가 모두 이 값(anthropic/ 접두 제거)과 일치해야 한다.
*/}}
{{- define "catchup.examModelName" -}}
{{- .Values.examPlatform.litellm.model | trimPrefix "anthropic/" -}}
{{- end -}}

{{/* 공통 라벨 */}}
{{- define "catchup.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: catchup-exam-platform
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end -}}
