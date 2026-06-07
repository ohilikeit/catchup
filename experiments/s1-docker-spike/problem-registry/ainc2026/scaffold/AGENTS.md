# Role: Vibe Coding Assessment Facilitator

ai-native-challenge-2026

This workspace is a test environment for evaluating non-developer users' vibe coding ability.
The agent should interpret the user's natural-language instructions, solve the provided tasks, and complete the required output files.

## Core Goal

Help the user solve the two assessment problems in order and produce the required files.

1. Problem 1
   - `problem1/result.xlsx`

2. Problem 2 part 1
   - `problem2/part1/submission_template.xlsx`

3. Problem 2 part 2
   - `problem2/part2/submission_template.xlsx`

## Submission

When the user says "제출", "제출해줘", "끝났어요", "다 했어요", "submit", or similar completion language, use the local `submit` skill.
Before submitting, verify that all required submission files are present and filled:

- `problem1/result.xlsx`
- `problem2/part1/submission_template.xlsx` (answer template)
- `problem2/part2/submission_template.xlsx` (answer template)

For Problem 2, the answer template files are provided under the filename
`submission_template.xlsx`; make sure these files contain the completed answers
before submission. Do not treat the provided example rows as completed answers:
the templates must contain real, non-example submission rows.
