# Comparable selection

Closed transactions, actual positive prices and dated sale sources are primary. Active/pending/unknown records are excluded from numeric reconciliation. Unavailable/low-reliability sale sources, non-arms-length sales, future sales, transactions older than 365 days, the subject itself and incompatible type/unit counts are excluded.

Search order: 0.5 mile / 183 days; 1 mile / 183 days; 1.5 miles / 183 days; 1.5 miles / 365 days. Prefer the earliest stage supporting four sales; retain up to six ranked sales. Beyond 1 mile or across a known different submarket requires explicit buyer-substitution evidence or the same reviewed submarket. Distance is computed from coordinates when possible; otherwise a sourced supplied distance is necessary. Geographic proximity does not establish market equivalence.

GLA outside 0.5–2 times proposed subject GLA is a configurable-methodology review guardrail implemented in selection, not a claim about appraisal standards. Gross adjustments above 40% or nonpositive adjusted prices exclude an indication; over 25% triggers review. Known style/utility differences without support remain unresolved.

Deduplicate properties across sources, retaining one indication per property (latest eligible sale, then source reliability). Preserve same-date price disagreements as conflicts. A duplicate must not increase sample size. Condition similarity is similar/superior/inferior/unknown relative to planned finish; a photo assessment is preliminary and loses weight.

Ranking uses location 25%, recency 15%, condition 15%, size 15%, layout 5%, type/units 5%, adjustment support 10%, source 10%. See `weighting.ts` for exact normalized components. With at least three comps, no indication exceeds 45% weight. Review extracted property facts, not just the final weighted output.

An adjusted price exceeding max(35% of the median, 3× median absolute deviation) is withheld pending review when at least three indications exist. This guards against one unusually expensive sale driving ARV; it is a methodology policy, not a claimed professional standard.
