# Designing a Simply Supported Beam: A Worked Example

This is the worked example I go through with every graduate who joins our team. It is a timber floor joist, which is about as simple as structural design gets, and that is the point: the steps are the same for a steel beam in a ten-storey building, and it is much easier to see them when the numbers are small. The design follows the logic of Eurocode 5, but I have simplified the modification factors, so do not use this page to design a real floor.

## The brief

A domestic floor spans 3.6 m between two load-bearing walls. Joists are at 400 mm centres. We want to check whether a C24 softwood joist, 47 mm × 195 mm, is adequate.

The floor carries:

| Load | Value | Type |
|---|---|---|
| Floorboards, ceiling, joist self-weight | 0.50 kN/m² | Permanent ($g_k$) |
| Domestic occupancy | 1.50 kN/m² | Variable ($q_k$) |

## Step 1: load on one joist

Each joist carries a 0.4 m wide strip of floor, so the characteristic line loads are

$$g_k = 0.50 \times 0.4 = 0.20\ \text{kN/m}, \qquad q_k = 1.50 \times 0.4 = 0.60\ \text{kN/m}.$$

For strength we factor them up, using 1.35 on permanent load and 1.5 on variable load:

$$w_d = 1.35 \times 0.20 + 1.5 \times 0.60 = 1.17\ \text{kN/m}.$$

The factors are not arbitrary pessimism. They allow for the chance that loads are higher than we expect, and the variable load gets the bigger factor because people and furniture are less predictable than plasterboard.

## Step 2: the worst bending moment and shear

For a uniformly loaded, simply supported beam of span $L$, the bending moment is greatest at midspan and the shear is greatest at the supports:

$$M_d = \frac{w_d L^2}{8} = \frac{1.17 \times 3.6^2}{8} = 1.90\ \text{kNm}$$

$$V_d = \frac{w_d L}{2} = \frac{1.17 \times 3.6}{2} = 2.11\ \text{kN}$$

If a graduate can't derive $wL^2/8$ from a free-body diagram, this is the moment to stop and do it. Everything else is arithmetic; this is the mechanics.

## Step 3: section properties

For a rectangle of breadth $b$ and depth $h$:

$$W = \frac{b h^2}{6} = \frac{47 \times 195^2}{6} = 297{,}900\ \text{mm}^3$$

$$I = \frac{b h^3}{12} = \frac{47 \times 195^3}{12} = 29.04 \times 10^{6}\ \text{mm}^4$$

$W$ is the section modulus, which governs bending strength, and $I$ is the second moment of area, which governs stiffness. Notice the powers: doubling the depth multiplies the strength by four and the stiffness by eight. That is why joists are tall and thin.

## Step 4: bending stress

$$\sigma_{m,d} = \frac{M_d}{W} = \frac{1.90 \times 10^{6}}{297{,}900} = 6.4\ \text{N/mm}^2$$

C24 timber has a characteristic bending strength of 24 N/mm². After the modification factors for load duration, moisture and material safety, the design strength is roughly 13–16 N/mm² for this case. Our 6.4 N/mm² is comfortably below. Bending is fine.

## Step 5: shear

For a rectangular section the peak shear stress is one and a half times the average:

$$\tau_d = \frac{1.5\,V_d}{b h} = \frac{1.5 \times 2110}{47 \times 195} = 0.35\ \text{N/mm}^2$$

The design shear strength is around 1.5 N/mm², so shear is not close to governing. It rarely does for long, lightly loaded timber; it matters for short, heavily loaded beams and near notches.

## Step 6: deflection, which is what actually governs

Strength checks prevent collapse. Deflection checks prevent a bouncy floor, cracked ceilings and doors that stick. For timber floors, deflection almost always decides the size.

Using unfactored loads, since we care about what the floor will actually do, and the mean stiffness of C24, $E_{0,mean} = 11{,}000$ N/mm²:

$$\delta = \frac{5 w L^4}{384 E I} = \frac{5 \times 0.80 \times 3600^4}{384 \times 11{,}000 \times 29.04 \times 10^{6}} = 5.5\ \text{mm}$$

where $w = g_k + q_k = 0.80$ kN/m, which is 0.80 N/mm. Creep in timber increases this over time; allowing for it brings the long-term figure to around 7 mm.

A common limit for domestic floors is span/300, which here is 12 mm. We pass, with room to spare. Many designers also check the deflection under a 1 kN point load, a measure of how the floor feels underfoot, and that check is often the one that pushes joists a size larger in practice.

## What to take away

- **Strength rarely governs timber floors; stiffness does.** Graduates often stop after the bending check.
- **Use factored loads for strength and unfactored loads for serviceability.** Mixing them up is the most common error I see in checking.
- **Write units everywhere.** The deflection formula mixes kN, m and N/mm² in a way that will quietly give an answer a thousand times too large if you are careless.
- **Sanity-check the answer.** A 3.6 m domestic floor needing joists half a metre deep, or managing with 100 mm, means something has gone wrong upstream.
