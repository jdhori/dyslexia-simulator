// The one equation used by every math demo on the page: the KaTeX simulator
// demo, and the two labelled reference renderings (native MathML and MathJax).
// Keeping it here means all three always show exactly the same maths.
//
// `aligned` with a leading `&` on each row left-aligns the lines (so the text
// lines sit flush-left rather than centered); the widest line still fills the
// block, which displayMode centers on the page.
export const MATH_LATEX = String.raw`\begin{aligned}
& \text{Ball of radius } r>0 \text{ centered at } \vec{x} \in \mathbb{R}^n \\
& \text{notation \& def.}\quad B_r(\vec{x})=\left\{\vec{y} \in \mathbb{R}^n \mid |\vec{y}-\vec{x}|<r\right\} \\
& (X, d)\quad \left\{\begin{array}{l}
\text{set } X,\ \text{distance } d: X \times X \to \mathbb{R}_{\geq 0}=\{s \in \mathbb{R} \mid s \geq 0\} \\
\forall\, x, y \in X: \ d(x, y)=d(y, x) \\
d(x, y)=0 \iff x=y \\
B_r(x)=\{y \in X \mid d(y, x)<r\} \\
\forall\, x, y, z: \ d(x, y)+d(y, z) \geq d(x, z)
\end{array}\right.
\end{aligned}`;
