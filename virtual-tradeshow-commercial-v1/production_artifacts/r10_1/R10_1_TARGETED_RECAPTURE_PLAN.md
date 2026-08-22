# R10.1 TARGETED RECAPTURE PLAN
## Wilo Showroom Physical Recapture Specification

### 1. Forensics Summary
- **Input Source Images**: 51 authentic photographs (AI/synthetic images excluded).
- **Match Graph Analysis**: 1 connected component with high internal cluster density, but angular disparities between booth perspectives cause SfM mapping fragmentation.
- **Best Registration Rate**: 29.4% (15/51 images).
- **Hard Gate Result**: **FAIL** (< 60.0% continuation threshold).

---

### 2. Precise Connectivity Break Points & Missing Transitions

| Break Point | Source Image | Target Image | Issue Description | Required Bridge Shots |
|---|---|---|---|---|
| **BREAK_01** | `booth01_a2` | `booth01_a3` | Left-front corner transition angle jump | 4-6 bridge shots |
| **BREAK_02** | `booth04_a3` | `booth05_a1` | Left flank reception to aisle transition | 3-5 bridge shots |
| **BREAK_03** | `booth07_a2` | `booth07_a3` | Digital display wall wide-to-close jump | 3-4 bridge shots |
| **BREAK_04** | `booth07_a3` | `booth08_a1` | Display wall to meeting lounge transition | 4-6 bridge shots |
| **BREAK_05** | `booth13_a3` | `booth14_a1` | Right-side smart hydronics corner turn | 4-5 bridge shots |
| **BREAK_06** | `booth14_a3` | `booth15_a1` | Right rear to panoramic hall overview | 4-6 bridge shots |

---

### 3. Actionable Recapture Protocol
1. **Targeted Bridge Capture**:
   - Total recommended additional bridge photographs: **24–32 images**.
   - Camera motion: Continuous arc around the booth perimeter at 10°–15° increments with 75%+ overlap between consecutive frames.
2. **Fixed Intrinsics**:
   - Maintain constant focal length (do not zoom).
   - Keep consistent orientation (landscape recommended).
3. **Lighting & Environment**:
   - Maintain consistent exposure across all angles.
