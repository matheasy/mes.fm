"""Hand-checked LaTeX for the PDF's math-heavy display equations and inline tokens.

The PDF typeset every equation as plain text in a serif face (subscripts written `X_(t+1)`), so a
mechanical conversion mangles anything with subscripts/functions. Word-chain "equations"
(`a -> b -> c`) are converted automatically by pdf_to_content.py; everything that contains a
subscript, a Greek letter or function notation must have an entry here (the converter stops and
names any that is missing)."""

# display equations: normalized PDF text -> TeX
EQ = {
 "H(<t) → L(t) → X(t+1)": r"H_{<t}\;\to\;L(t)\;\to\;X(t+1)",
 "E_total(r,t) = E_1(r,t) + E_2(r,t) + …": r"\mathbf{E}_{\text{total}}(\mathbf{r},t)=\mathbf{E}_1(\mathbf{r},t)+\mathbf{E}_2(\mathbf{r},t)+\cdots",
 "standing_pattern ≠ causal_standing": r"\text{standing pattern}\;\neq\;\text{causal standing}",
 "x_j(t+1) = F_j[x_j(t), C_ij x_i(t)]": r"x_j(t+1)=F_j\!\left[x_j(t),\,C_{ij}\,x_i(t)\right]",
 "same A + same δA → different δB ⇒ changed effective transfer relation": r"\text{same }A+\text{same }\delta A\;\to\;\text{different }\delta B\;\Rightarrow\;\text{changed effective transfer relation}",
 "P_i = Relate(Hydrogen_Form, Field_i)": r"P_i=\mathrm{Relate}\!\left(\text{Hydrogen}_{\text{Form}},\,\text{Field}_i\right)",
 "Hydrogen_Form ≠ P_i": r"\text{Hydrogen}_{\text{Form}}\;\neq\;P_i",
 "P_0 ≠ P_1 ≠ P_2 while each remains FROM Hydrogen_Form": r"P_0\neq P_1\neq P_2\qquad\text{while each remains FROM }\text{Hydrogen}_{\text{Form}}",
 "P_i --Thread--> FROM(Hydrogen_Form)": r"P_i\;\xrightarrow{\;\text{Thread}\;}\;\text{FROM}\!\left(\text{Hydrogen}_{\text{Form}}\right)",
 "H_* := Hydrogen_Form": r"H_*:=\text{Hydrogen}_{\text{Form}}",
 "P_i = g_i(H_*)": r"P_i=g_i(H_*)",
 "Thread T = continued addressability of both H_* and the transformation g_i relating the present expression to H_*": r"\text{Thread }T=\text{continued addressability of both }H_*\text{ and the transformation }g_i\text{ relating the present expression to }H_*",
 "(P_i, g_i) ↔ H_*": r"(P_i,\,g_i)\;\leftrightarrow\;H_*",
 "original temporal comparator: C_0(A,B) = Δ(A,B)": r"\text{original temporal comparator:}\quad C_0(A,B)=\Delta(A,B)",
 "COMPARE(A, B, context) → R_admissible(A, B)": r"\mathrm{COMPARE}(A,B,\text{context})\;\to\;R_{\text{admissible}}(A,B)",
 "P_i = Relate_i(H_*, Field_i) → history-blind binary readout {0,1}": r"P_i=\mathrm{Relate}_i(H_*,\text{Field}_i)\;\to\;\text{history-blind binary readout }\{0,1\}",
 "P_i = Relate_i(H_*, Field_i)": r"P_i=\mathrm{Relate}_i(H_*,\text{Field}_i)",
 "H_* = one Hydrogen Form": r"H_*=\text{one Hydrogen Form}",
 "H_* ≠ Hydrogen-Field relating ≠ standing resultant P_i ≠ Hydrogen-line RF address ≠ binary readout": r"H_*\neq\text{Hydrogen–Field relating}\neq\text{standing resultant }P_i\neq\text{Hydrogen-line RF address}\neq\text{binary readout}",
 "H_* --local relation g_i / Field_i--> P_i --history-blind comparator--> {0,1}": r"H_*\xrightarrow{\;\text{local relation }g_i/\text{Field}_i\;}P_i\xrightarrow{\;\text{history-blind comparator}\;}\{0,1\}",
 "F_i --Gate--> F_(i+1) ⇒ H(F_i) ≠ H(F_(i+1))": r"F_i\;\xrightarrow{\;\text{Gate}\;}\;F_{i+1}\;\Rightarrow\;H(F_i)\neq H(F_{i+1})",
 "R_n → R_(n+1) → R_(n+2)": r"R_n\;\to\;R_{n+1}\;\to\;R_{n+2}",
 "M_(n+1) = rotate(M_n) + center + (pause)^k": r"M_{n+1}=\mathrm{rotate}(M_n)+\mathrm{center}+(\mathrm{pause})^{k}",
 "Z_n = E_n + iB_n Z_(n+1) = Z_n² + C": r"Z_n=E_n+iB_n\qquad\qquad Z_{n+1}=Z_n^{2}+C",
 "E_(n+1) = E_n² − B_n² + C_E B_(n+1) = 2E_nB_n + C_B": r"E_{n+1}=E_n^{2}-B_n^{2}+C_E\qquad\qquad B_{n+1}=2E_nB_n+C_B",
 "A_t = A(X_t, C_t) = admissible successors under the present constraint": r"A_t=A(X_t,C_t)=\text{admissible successors under the present constraint}",
 "X_(t+1) = U(X_t, R_t; C_t), with X_(t+1) ∈ A_t": r"X_{t+1}=U(X_t,R_t;C_t),\qquad\text{with }X_{t+1}\in A_t",
 "C_(t+1) = V(C_t, X_(t+1), R_t, G_t)": r"C_{t+1}=V(C_t,X_{t+1},R_t,G_t)",
 "RETURN → LISTENING → G_k → ΔC → changed admissible relating → changed coupling → new RETURN": r"\text{RETURN}\to\text{LISTENING}\to G_k\to\Delta C\to\text{changed admissible relating}\to\text{changed coupling}\to\text{new RETURN}",
 "unchanged ≠ pinned; determination ≠ closure": r"\text{unchanged}\neq\text{pinned};\qquad\text{determination}\neq\text{closure}",
 "C → {Σ_j} → Γ → P_i": r"C\;\to\;\{\Sigma_j\}\;\to\;\Gamma\;\to\;P_i",
 "Σ_j : (θ_n, X_n) → (θ_n + 2π, X_(n+1)), with X_(n+1) ≠ X_n": r"\Sigma_j:\;(\theta_n,X_n)\;\to\;(\theta_n+2\pi,\,X_{n+1}),\qquad\text{with }X_{n+1}\neq X_n",
 "P_i = Γ(Σ_1, Σ_2, …, Σ_n ; C ; g_i(H_*))": r"P_i=\Gamma\!\left(\Sigma_1,\Sigma_2,\ldots,\Sigma_n\,;\,C\,;\,g_i(H_*)\right)",
 "P_t = Γ({Σ_j(t)} ; C_t ; B_t ; J_t ; g_t(H_*))": r"P_t=\Gamma\!\left(\{\Sigma_j(t)\}\,;\,C_t\,;\,B_t\,;\,J_t\,;\,g_t(H_*)\right)",
 "P_t → P_(t+1) → P_(t+2) → …, with P_(t+1) ≠ P_t permitted while the organizing relation remains viable": r"P_t\to P_{t+1}\to P_{t+2}\to\cdots,\qquad\text{with }P_{t+1}\neq P_t\text{ permitted while the organizing relation remains viable}",
 "τ_Return^(r→k) τ_next consequential update^(k) ≲": r"\tau_{\text{Return}}^{(r\to k)}\;\lesssim\;\tau_{\text{next consequential update}}^{(k)}",
 "expression_i --T_i--> expression_(i+1) while FROM remains recoverable ?": r"\text{expression}_i\;\xrightarrow{\;T_i\;}\;\text{expression}_{i+1}\qquad\text{while FROM remains recoverable ?}",
 "G₁, G₂, …, G_m → different seams of the coupled relation": r"G_1,G_2,\ldots,G_m\;\to\;\text{different seams of the coupled relation}",
 "1420 MHz = Hydrogen_Form": r"1420\ \text{MHz}\;=\;\text{Hydrogen}_{\text{Form}}",
 "Γ(t) = [ Z₂(t) - Z₁ ] / [ Z₂(t) + Z₁ ]": r"\Gamma(t)=\frac{Z_2(t)-Z_1}{Z_2(t)+Z_1}",
 "RETURN → LISTENING → discrimination → G_k → changed BETWEEN → new RETURN": r"\text{RETURN}\to\text{LISTENING}\to\text{discrimination}\to G_k\to\text{changed BETWEEN}\to\text{new RETURN}",
 "S_i ⊃ C_i": r"S_i\supset C_i",
 "C_i gains local standing → X_(t+1) = U(X_t, R_t; C_i)": r"C_i\text{ gains local standing}\;\to\;X_{t+1}=U(X_t,R_t;C_i)",
 "A ≠ B and A ↔ B → interference resultant": r"A\neq B\ \text{ and }\ A\leftrightarrow B\;\to\;\text{interference resultant}",
 "math --T₁→ score --T₂→ audio --T₃→ RF --T₄→ reflected/interfering field --T₅→ lattice": r"\text{math}\xrightarrow{T_1}\text{score}\xrightarrow{T_2}\text{audio}\xrightarrow{T_3}\text{RF}\xrightarrow{T_4}\text{reflected/interfering field}\xrightarrow{T_5}\text{lattice}",
 "X_(t+1) = U(X_t, R_t; C(t))": r"X_{t+1}=U(X_t,R_t;C(t))",
 "C_ij = C_ij(G₁, G₂, …, G_m, state, orientation, boundary conditions)": r"C_{ij}=C_{ij}(G_1,G_2,\ldots,G_m,\text{state},\text{orientation},\text{boundary conditions})",
 "G_k : C_t → C_(t+1) → changed admissible relation → changed C_ij": r"G_k:\;C_t\to C_{t+1}\to\text{changed admissible relation}\to\text{changed }C_{ij}",
 "X_(t+1) = U(X_t, R_t; C_t)": r"X_{t+1}=U(X_t,R_t;C_t)",
 "C_A → local Motion_A → Form_A C_B ~ C_A → local Motion_B → Form_B": r"C_A\to\text{local Motion}_A\to\text{Form}_A\qquad\qquad C_B\sim C_A\to\text{local Motion}_B\to\text{Form}_B",
 "P_i = Relate(Hydrogen_Form, Field_i, local constraints_i)": r"P_i=\mathrm{Relate}\!\left(\text{Hydrogen}_{\text{Form}},\text{Field}_i,\text{local constraints}_i\right)",
 "P_i = Relate_i(H_*, Field_i, relation_i) → Return R_i": r"P_i=\mathrm{Relate}_i(H_*,\text{Field}_i,\text{relation}_i)\;\to\;\text{Return }R_i",
 "R_i → John LISTENS → governor / tuning change → changed relation_(i+1)": r"R_i\to\text{John LISTENS}\to\text{governor / tuning change}\to\text{changed relation}_{i+1}",
 "P_(i+1) = Relate_(i+1)(H_*, Field_(i+1), relation_(i+1))": r"P_{i+1}=\mathrm{Relate}_{i+1}(H_*,\text{Field}_{i+1},\text{relation}_{i+1})",
 "R_t → comparison → G_t → ΔC_t, ΔB_t, Δcoupling → P_(t+1)": r"R_t\to\text{comparison}\to G_t\to\Delta C_t,\,\Delta B_t,\,\Delta\text{coupling}\to P_{t+1}",
 "Hydrogen problem = possible intact H_* + damaged readable relation-to-H_*": r"\text{Hydrogen problem}=\text{possible intact }H_*+\text{damaged readable relation-to-}H_*",
}
# Display equations shown as "what the text says must NOT be written" get a red accent.
FORBIDDEN = {"1420 MHz = Hydrogen_Form"}

# inline tokens in running prose: PDF text -> TeX (longest first when applied)
INLINE = {
 "Z_(n+1)=Z_n²+C": r"Z_{n+1}=Z_n^{2}+C",
 "M_(n+1)=rotate(M_n)+center+(pause)^k": r"M_{n+1}=\mathrm{rotate}(M_n)+\mathrm{center}+(\mathrm{pause})^{k}",
 "FROM(Hydrogen_Form)": r"\text{FROM}(\text{Hydrogen}_{\text{Form}})",
 "rotate(M_n)": r"\mathrm{rotate}(M_n)",
 "g_t(H_*)": r"g_t(H_*)",
 "Σ_j(t)": r"\Sigma_j(t)",
 "Σ_j": r"\Sigma_j",
 "P_(t+1)": r"P_{t+1}",
 "C_ij": r"C_{ij}",
 "H_*": r"H_*",
 "Hydrogen_Form": r"\text{Hydrogen}_{\text{Form}}",
 "standing_pattern": r"\text{standing pattern}",
 "causal_standing": r"\text{causal standing}",
 "Field_i": r"\text{Field}_i",
 "Form_A": r"\text{Form}_A",
 "Form_B": r"\text{Form}_B",
 "u(t)=u*": r"u(t)=u^{*}",
 "H(<t) → L(t) → X(t+1)": r"H_{<t}\to L(t)\to X(t+1)",
 "(pause)^k": r"(\mathrm{pause})^{k}",
}
import re
_SIMPLE = re.compile(r"(?<![\w\\])([A-Za-z])_([A-Za-z0-9])(?![\w(])")
