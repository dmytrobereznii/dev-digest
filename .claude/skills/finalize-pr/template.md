# PR body template

Fill every `{…}`. Keep the headings and their order.

```markdown
## Урок {N} — {назва уроку одним рядком}

{2–4 речення: що саме побудовано в цьому уроці, які поверхні UI/API/доки це
зачепило, і що з цього мав побачити ментор. Рядок з README «What you build in
the course» — цитатою.}

## Критерії оцінювання

| № | Критерій | Як зараховується | Статус | Доказ |
| --- | --- | --- | --- | --- |
| 1 | {текст ментора, дослівно} | {текст ментора, дослівно} | ✅ | [`{path}:{line}`]({permalink}) |
| 2 | … | … | ✅ | [`{path}:{line}`]({permalink}) · [`{test}:{line}`]({permalink}) |
| 3 | … | … | ⚠️ | {одне речення: чого бракує і чому} |

## Додатково

- **{Що зроблено}** — {для чого, одним реченням} ([`{sha}`]({commit-url})).
- …

## Обмеження

{Лише коли є хоча б один ⚠️: по одному реченню на рядок, з номером критерію.
Інакше розділ прибрати повністю.}
```

Evidence column conventions:

- Code or doc: `` [`server/src/x.ts:42`](permalink) ``. Range when the proof
  spans lines: `#L40-L58`.
- Several proofs in one row: join with ` · `.
- Process criteria: link the dated `INSIGHTS.md` entry or the spec file the
  same way, plus the commit that closed the phase when one exists.
