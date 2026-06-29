# -*- coding: utf-8 -*-
"""S6 렌더 — section03.jsonl 로 V2.0 리포트 HTML 섹션 03 자동 채움 (overview §6 S6 / schema §4).

V2.0 DOM(.guide-card)에 정확히 맞춰 3버킷을 생성한다. 섹션 헤더·인트로 문단은 보존하고,
인트로 이후 ~ </section> 사이만 교체한다(섹션 4 이후는 절대 건드리지 않음).

  python render_html.py --jsonl out/<id>/section03.jsonl \
      --template "CATCHUP AX ... V2.0 ....html" --out out/<id>/report.filled.html
"""
import argparse
import html
import json
from pathlib import Path

START = "<!-- 섹션 3: 나에게 맞는 AI 활용법 -->"
END = "<!-- 섹션 4:"
BUCKET_HEADING = {
    "strength":   "1. 계속 활용할 방식",
    "weakness":   "2. 보완하면 좋은 방식",
    "suggestion": "3. 새롭게 시도할 방식",
}
ORDER = ["strength", "weakness", "suggestion"]


def _esc(s):
    return html.escape(str(s or ""), quote=False)


def _card(item):
    rows = "".join(
        f'<div class="guide-workflow-row"><dt>{_esc(r.get("role"))}</dt>'
        f'<dd>{_esc(r.get("text"))}</dd></div>'
        for r in item.get("workflow", [])
    )
    actions = "".join(f"<li>{_esc(s)}</li>" for s in item.get("action_steps", []))
    prompts = "".join(f"<li>{_esc(p)}</li>" for p in item.get("prompts", []))
    return f"""            <div class="guide-card">
                <div class="guide-context">{_esc(item.get("context"))}</div>
                <h4 class="guide-title">{_esc(item.get("title"))}</h4>

                <section class="guide-workflow">
                    <h5 class="guide-subtitle">실제 작업 흐름</h5>
                    <dl class="guide-workflow-list">{rows}</dl>
                </section>

                <section class="guide-action">
                    <h5 class="guide-subtitle">활용 방법</h5>
                    <ul class="guide-action-list">{actions}</ul>
                </section>

                <section class="guide-prompts">
                    <h5 class="guide-subtitle">바로 활용할 문장</h5>
                    <ul class="guide-prompt-list">{prompts}</ul>
                </section>
            </div>"""


def _bucket_html(bucket, items):
    head = f'            <h3 class="s01-area-heading">{BUCKET_HEADING[bucket]}</h3>'
    if not items:
        return (head + '\n            <p class="comparison-intro" style="margin-bottom: 14px;">'
                       '이번 검사에서는 해당 항목이 확인되지 않았습니다.</p>')
    cards = "\n\n".join(_card(it) for it in sorted(items, key=lambda x: x.get("order", 99)))
    return head + "\n\n" + cards


def load_jsonl(path):
    meta, items = None, []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        o = json.loads(line)
        if o.get("type") == "meta":
            meta = o
        elif o.get("type") == "item":
            items.append(o)
    return meta, items


def render(jsonl_path, template_path, out_path):
    meta, items = load_jsonl(jsonl_path)
    # 서술 미완성(스켈레톤) item 은 렌더 거부 — synthesizer 를 먼저 돌려야 한다(빈 카드 방지)
    pending = [it.get("label") for it in items if it.get("needsNarration") or it.get("title") is None]
    if pending:
        raise RuntimeError(
            "서술이 채워지지 않은 item 이 있습니다: " + ", ".join(map(str, pending)) +
            ". synthesizer(backend=task|http)로 서술 슬롯을 먼저 채운 뒤 렌더하세요.")
    tpl = Path(template_path).read_text(encoding="utf-8")

    s = tpl.find(START)
    e = tpl.find(END)
    if s == -1 or e == -1 or e < s:
        raise RuntimeError("섹션 3/4 경계 마커를 찾지 못함 — 템플릿 확인")

    block = tpl[s:e]
    # 인트로 문단 끝(첫 comparison-intro 의 </p>)까지 보존
    intro = block.find('class="comparison-intro"')
    intro_end = block.find("</p>", intro) + len("</p>")
    preserved = block[:intro_end]

    by_bucket = {b: [it for it in items if it.get("bucket") == b] for b in ORDER}
    buckets = "\n\n".join(_bucket_html(b, by_bucket[b]) for b in ORDER)

    new_block = (preserved + "\n\n" + buckets +
                 "\n        </section>\n\n        ")
    out = tpl[:s] + new_block + tpl[e:]

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_text(out, encoding="utf-8")
    n = {b: len(by_bucket[b]) for b in ORDER}
    print(f"✓ 채움: 강점 {n['strength']} · 보완 {n['weakness']} · 제안 {n['suggestion']} "
          f"(헤드라인 {meta and meta.get('headlineScore')}) → {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jsonl", required=True)
    ap.add_argument("--template", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    render(a.jsonl, a.template, a.out)


if __name__ == "__main__":
    main()
