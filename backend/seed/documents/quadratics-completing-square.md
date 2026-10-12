# Quadratics Without Memorising the Formula

My SHS 2 students arrive knowing the quadratic formula the way they know a song: they can sing it, but ask them where it comes from and the room goes quiet. This sequence teaches completing the square first, and lets the formula appear at the end as something they have *derived*. It takes about a week longer than starting with the formula. In my experience the extra week pays for itself by the end of term, because students who understand completing the square can also sketch parabolas, find turning points and solve inequalities without learning three more methods.

## Lesson 1: perfect squares

Start with algebra tiles, or squares drawn on squared paper if you don't have tiles. Ask students to build $x^2 + 6x + 9$ as a square. The $x^2$ tile goes in a corner, the six $x$-strips split three along each side, and the nine unit tiles fill the gap. The result is a square of side $x + 3$:

$$x^2 + 6x + 9 = (x + 3)^2$$

Then try $x^2 + 6x + 5$. It almost makes a square but is four units short:

$$x^2 + 6x + 5 = (x + 3)^2 - 4$$

That is completing the square. The picture does the explaining; the algebra just records it.

**The pattern students should find themselves:** to complete $x^2 + bx$, halve $b$, and

$$x^2 + bx = \left(x + \frac{b}{2}\right)^2 - \left(\frac{b}{2}\right)^2.$$

## Lesson 2: solving equations

Once an equation is written as a square, solving it is undoing:

$$x^2 + 6x + 5 = 0 \;\Rightarrow\; (x + 3)^2 = 4 \;\Rightarrow\; x + 3 = \pm 2 \;\Rightarrow\; x = -1 \text{ or } x = -5.$$

Watch for two errors:

- **Forgetting the ±.** Students who only write $x + 3 = 2$ lose a root. I ask them to say out loud "what number squared gives 4?" until "two *or* minus two" becomes automatic.
- **Leading coefficients.** For $2x^2 + 8x - 10 = 0$, divide through by 2 first. If they complete the square with the 2 still there, everything after goes wrong.

Practise with equations whose roots are not whole numbers:

$$x^2 - 4x - 1 = 0 \;\Rightarrow\; (x - 2)^2 = 5 \;\Rightarrow\; x = 2 \pm \sqrt{5}.$$

Students are often uneasy about leaving a surd in the answer. Tell them it is exact, and that the decimal is the approximation.

## Lesson 3: the graph

Completed-square form tells you where the parabola turns. In

$$y = (x - 2)^2 - 5,$$

the squared term is never negative, so $y$ is smallest when $x = 2$, and that smallest value is $-5$. The turning point is $(2, -5)$, and the line of symmetry is $x = 2$.

Have students sketch three or four parabolas from completed-square form *before* checking them on a graphing tool. The ones who were unsure about the algebra in lesson 2 often understand it here, because the picture shows why the roots are symmetric about the turning point.

## Lesson 4: the formula, derived

Now complete the square on the general equation $ax^2 + bx + c = 0$, as a class, one line at a time:

$$x^2 + \frac{b}{a}x + \frac{c}{a} = 0$$

$$\left(x + \frac{b}{2a}\right)^2 - \frac{b^2}{4a^2} + \frac{c}{a} = 0$$

$$\left(x + \frac{b}{2a}\right)^2 = \frac{b^2 - 4ac}{4a^2}$$

$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$

When the formula appears at the bottom of the board, there is usually a moment of recognition. It is the same song, but now they know the words.

## Lesson 5: the discriminant

The expression under the square root, $b^2 - 4ac$, decides how many real roots there are. Students can now explain why, rather than memorising a table:

| $b^2 - 4ac$ | Roots | Graph |
|---|---|---|
| Positive | Two distinct real roots | Crosses the $x$-axis twice |
| Zero | One repeated root | Touches the axis at the turning point |
| Negative | No real roots | Never reaches the axis |

## Assessment questions I use

1. Write $x^2 + 10x + 21$ in completed-square form and hence solve $x^2 + 10x + 21 = 0$.
2. A ball is thrown so that its height after $t$ seconds is $h = 20t - 5t^2$. Find the maximum height without using calculus.
3. For what values of $k$ does $x^2 + kx + 9 = 0$ have exactly one root?
4. Explain, in words, why the quadratic formula cannot give a real answer when $b^2 - 4ac < 0$.

Question 4 separates the class more clearly than any calculation. Students who can answer it have understood the unit.
