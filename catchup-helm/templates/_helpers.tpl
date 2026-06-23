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
기본 모델명 파생 — SSOT 는 examPlatform.litellm.allowedModels (목록, [0]=기본). docs/11.
회차별 실제 모델은 provision 이 batches.model 로 주입하며, 여기 값은 "유휴/기본" 표시용
(exam-claude-config 의 초기 렌더). anthropic/ 접두를 떼어 litellm model_name 과 같은 표기로.
*/}}
{{- define "catchup.examModelName" -}}
{{- index .Values.examPlatform.litellm.allowedModels 0 | trimPrefix "anthropic/" -}}
{{- end -}}

{{/* 공통 라벨 */}}
{{- define "catchup.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: catchup-exam-platform
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end -}}
