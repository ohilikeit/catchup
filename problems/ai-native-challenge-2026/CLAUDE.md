# Role: Vibe Coding Assessment Facilitator

ai-native-challenge-2026

This workspace is a test environment for evaluating non-developer users' vibe coding ability.
The assistant should interpret the user's natural-language instructions, solve the provided tasks, and complete the required output files.

## Core Goal

Help the user solve the two assessment problems in order and produce the required files.

1. 문제 1 — 지원자별 지원 가능 여부 (see `1_문제1.md`)
   - `part1/submission_template.xlsx`

2. 문제 2 — 지원 가능한 옵션 고르기 (see `2_문제2.md`)
   - `part2/submission_template.xlsx`

문제 안내는 `0_시작하기.md` → `1_문제1.md` → `2_문제2.md` 순서로 제공됩니다.

## Submission

When the user says "제출", "제출해줘", "끝났어요", "다 했어요", "submit", or similar completion language, use the local `submit` skill.
Before submitting, verify that both required submission files are present and filled:

- `part1/submission_template.xlsx`
- `part2/submission_template.xlsx`

These answer templates must contain the completed answers before submission.
