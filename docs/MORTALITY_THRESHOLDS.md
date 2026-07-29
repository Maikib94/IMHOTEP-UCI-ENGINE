# IMHOTEP UCI — Umbrales de Mortalidad Aguda

**Versión:** Área 4 / AcuteMortalityEngine v1.0  
**Autor:** Motor clínico IMHOTEP  
**Calibración:** AHA 2025 / Walsh 2013 / Kraut-Madias 2010 / ATLS 10th ed. / BTF 2016

---

Este documento explica **exactamente** qué condiciones fisiológicas pueden causar la muerte de un paciente simulado, además de la mortalidad estocástica progresiva por SOFA (PrognosisEngine).

## Arquitectura de dos motores

IMHOTEP implementa **DOS motores de mortalidad complementarios** que operan en paralelo:

### 1. PrognosisEngine — Mortalidad sub-aguda por MOF

| Característica | Detalle |
|---|---|
| **Escala temporal** | Días (D1–D14) |
| **Mecanismo** | Probabilidad diaria estocástica f(SOFA, calidad de manejo) |
| **Calibración** | Raith JAMA 2017 (n=184,875 admisiones UCI) |
| **Causa típica** | "MOF en D5: SOFA 14, manejo subóptimo" |
| **Reversión** | Mejorar SOFA y manejo reduce probabilidad diaria |

> [!NOTE]
> El PrognosisEngine **no se modifica** con esta área. Sigue manejando la mortalidad crónica por disfunción multiorgánica progresiva.

### 2. AcuteMortalityEngine — Mortalidad aguda por umbrales

| Característica | Detalle |
|---|---|
| **Escala temporal** | Segundos a minutos |
| **Mecanismo** | Umbrales fisiológicos con duración de exposición sostenida |
| **Calibración** | AHA 2025, Walsh 2013, Kraut-Madias 2010, ATLS 10th ed. |
| **Causa típica** | "PCR por MAP <30 sostenido 5 min" |
| **Posición en tick** | Al final de la cadena — lee vitals FINALES del tick |

**Regla de prioridad:** El primer engine que dispare muerte gana. Si ambos coincidieran en el mismo tick, `AcuteMortalityEngine` tiene prioridad (más específico, mayor valor didáctico — el residente aprende qué umbral exacto mató al paciente).

---

## Tabla de umbrales letales

| ID | Causa | Vital | Umbral | Duración | Exenciones | Referencia |
|----|-------|-------|--------|----------|------------|------------|
| `hemo_refractaria` | PCR por hipotensión refractaria | MAP | < 30 mmHg | **5 min** | — | Walsh 2013 |
| `hemo_catastrofica` | PCR por colapso hemodinámico catastrófico | MAP | < 40 mmHg | **15 min** | — | AHA 2025, Lehman 2013 |
| `hipoxia_grave` | PCR hipoxémico | SpO₂ | < 50% | **10 min** | VV/VA-ECMO | Goligher 2021 |
| `hipoxia_critica` | PCR por anoxia | PaO₂ | < 25 mmHg | **5 min** | VV/VA-ECMO | Nunn (textbook) |
| `acidosis_refractaria` | PCR por acidemia incompatible con la vida | pH | < 6.80 | **15 min** | — | Kraut & Madias 2010 |
| `acidosis_catastrofica` | Asistolia por acidemia extrema | pH | < 6.60 | **5 min** | — | Kraut & Madias 2010 |
| `herniacion_cerebral` | Muerte encefálica por herniación | CPP* | ≤ 0 mmHg | **15 min** | — | Hawryluk 2022, BTF 2016 |
| `cpp_critico` | Isquemia cerebral global | CPP* | < 30 mmHg | **30 min** | — | BTF 2016, Robba 2021 |
| `hiperkalemia_mortal` | PCR por hiperkalemia | K⁺ | > 8.5 mEq/L | **10 min** | CRRT ≥20 mL/kg/h | KDIGO 2012 |
| `hipotermia_grave` | PCR por hipotermia grave | Temperatura | < 28°C | **30 min** | — | Brown 2012 |
| `hipertermia_maligna` | Hipertermia maligna refractaria | Temperatura | > 41.5°C | **20 min** | — | Bouchama 2002 |
| `shock_hemorragico_terminal` | PCR por shock hemorrágico clase IV | Volemia | < 2000 mL | **3 min** | — | ATLS 10th ed. |
| `bradicardia_extrema` | Asistolia por bradicardia extrema | FC | < 20 lpm | **5 min** | — | AHA 2025 ACLS |
| `taquicardia_extrema` | PCR por taquiarritmia | FC | > 220 lpm | **5 min** | — | AHA 2025 ACLS |

*CPP = MAP − ICP (calculado internamente por el engine)

---

## Mecanismo de acumulación: "deuda fisiológica"

El AcuteMortalityEngine implementa un modelo de **acumulación gradual con decay parcial** para reflejar la realidad clínica de que el daño orgánico residual no desaparece instantáneamente al corregir el parámetro.

### Lógica de counter

```
Si vital está en zona peligrosa:
  counter.accumulatedSeconds += dt

Si vital regresa a rango normal:
  counter.accumulatedSeconds = max(0, accumulatedSeconds - dt × 0.5)
  // Decay al 50% del rate de acumulación — no reset instantáneo
```

### Muerte disparada cuando:
```
counter.accumulatedSeconds ≥ threshold.sustainedSeconds
```

### HUD de alerta temprana (MortalityDangerBadge)

Los badges aparecen cuando `accumulatedSeconds > 25% × sustainedSeconds`:

| % del threshold | Color | Comportamiento |
|---|---|---|
| 25–50% | 🟡 Ámbar | Badge visible, sin animación |
| 50–80% | 🟠 Naranja | Barra naranja |
| >80% | 🔴 Rojo | Pulse animado — peligro inmediato |

---

## Reset gradual — implicancia didáctica

> [!IMPORTANT]
> Esta característica es el corazón del valor pedagógico del sistema.

**Escenario ejemplo:**

1. MAP cae a 25 mmHg durante **3:00 min** → counter = 180 s
2. Residente administra noradrenalina → MAP sube a 80 mmHg
3. Esperar **60 s** → counter = 180 − 60×0.5 = **150 s** (NO vuelve a 0)
4. Si MAP vuelve a caer <30 mmHg → parte de **150 s**, no de 0
5. Solo necesita **150 s más** → muerte a los 2:30 min del segundo episodio

**Mensaje didáctico:** Las hipotensiones recurrentes acumulan riesgo aunque cada episodio individual sea "corto". El daño orgánico residual se acumula.

---

## Exenciones — cuándo el umbral NO aplica

Algunas causas de muerte tienen exenciones cuando hay soporte extracorpóreo activo:

### VV-ECMO o VA-ECMO activo
- **`hipoxia_grave`** (SpO₂ <50%): exento porque la oxigenación proviene de la membrana extracorpórea
- **`hipoxia_critica`** (PaO₂ <25): exento por el mismo motivo
- *Nota:* ECCO2R **no exime** (no proporciona oxigenación, solo CO₂ removal)

### CRRT activa con dosis ≥20 mL/kg/h
- **`hiperkalemia_mortal`** (K⁺ >8.5): exento porque el clearance de K⁺ es efectivo a esta dosis

---

## Cómo prevenir muertes evitables

### Hipotensión refractaria (MAP <30)
- **Noradrenalina** en infusión continua (primera línea, SSCG 2024)
- **Cristaloides** para precarga si hipovolemia (SAFE 2004 — cristaloides ≥1 en sépticos)
- **Buscar foco** — la causa de la hipotensión debe tratarse (foco infeccioso, taponamiento, neumotórax)
- **Objetivo:** MAP ≥65 mmHg en sepsis (SSCG 2024), MAP ≥80 en TCE (BTF 2016)

### Hipoxemia grave (SpO₂ <50 / PaO₂ <25)
- **Aumentar FiO₂** hasta 1.0 si en ARM
- **PEEP recruitment maneuver** (si SDRA)
- **Decúbito prono** si P/F <150 (PROSEVA 2013)
- **Considerar VV-ECMO** si criterios EOLIA (P/F <80 con FiO₂ 1.0 y PEEP ≥10)

### Acidosis refractaria (pH <6.80)
- **Bicarbonato sódico** 1-2 mEq/kg si pH <7.15 + AKI o anestésicos administrados
- **Tratar causa primaria:**
  - Lactato → optimizar perfusión (NA, fluidos, ECMO-VA si shock refractario)
  - CAD → insulina + fluidos + K⁺
  - Acidosis hiperclorémica → cambiar SF 0.9% por RL
- **CRRT** con bicarbonato de reposición si AKI severo

### Herniación cerebral (CPP ≤0)
- **Manitol 20%** 0.5-1 g/kg IV urgente (o salino hipertónico 3%)
- **Elevar MAP** con noradrenalina (objetivo CPP 60-70 mmHg)
- **Hiperventilación moderada** PaCO₂ 35-40 (solo como puente — BTF 2016)
- **EVD** si hidrocefalia activa
- **Craniectomía descompresiva** si TCE con hipertensión refractaria (DECRA/RESCUEicp)

### Hiperkalemia mortal (K⁺ >8.5)
- **Gluconato Ca²⁺** 1-3 g IV (estabilizador de membrana — efecto inmediato)
- **Insulina + glucosa** (desplaza K⁺ al intracelular)
- **Bicarbonato** si acidosis concomitante
- **Kayexalato** (resina) o **Patiromer** (más moderno)
- **CRRT urgente** si K⁺ >6.5 con oliguria/anuria (KDIGO 2012)

### Hipotermia grave (T <28°C)
- **Recalentamiento externo activo:** manta calefactora, fluidos IV calientes
- **ECMO-VA** si arritmias refractarias (Brown 2012 — "no muerto hasta que esté caliente")
- **Evitar RCP vigorosa** hasta T >28°C — riesgo FV iatrógena

### Shock hemorrágico clase IV (volemia <2000 mL)
- **Activar protocolo transfusión masiva:** ratio 1:1:1 GRE:PFC:PLT (PROPPR 2015)
- **Control de hemorragia quirúrgico** urgente (cirugía de control de daño)
- **Ácido tranexámico** 1g IV si <3h del trauma (CRASH-2 2010)
- **Tolerar hipotensión permisiva** MAP 50-65 hasta control quirúrgico (ATLS 10th)

### Bradiarritmia extrema (FC <20)
- **Atropina** 0.5-1 mg IV (repetir hasta 3 mg total)
- **Marcapasos transcutáneo** urgente si no responde
- **Adrenalina** 2-10 mcg/min como puente
- **Buscar causa:** bloqueo AV completo, hiperpotasemia, intoxicación digitálica, mixedema

### Taquiarritmia extrema (FC >220 con MAP <60)
- **Cardioversión eléctrica sincronizada** inmediata si inestable (ACLS 2025)
- **Verificar causa:** WPW, TV polimórfica (torsades), toxicidad simpaticomiméticos
- **Amiodarona** 150 mg IV si TV monomórfica estable
- **Magnesio** 2g IV si Torsades de Pointes

---

## Bibliografía

| Referencia | Aplicación |
|---|---|
| Walsh AJ et al. *Anesthesiology* 2013;119:507-15 | MAP thresholds 30/40 mmHg |
| Lehman LH et al. *Crit Care Med* 2013;41:34-40 | Deuda de hipotensión |
| AHA 2025 Part 11 Post-Cardiac Arrest Care | MAP, FC thresholds |
| Goligher EC et al. *AJRCCM* 2021;204:1378-86 | SpO₂ threshold hipoxémico |
| Nunn JF. *Applied Respiratory Physiology* (textbook) | PaO₂ <25 mmHg |
| Kraut JA, Madias NE. *NEJM* 2010;363:1646-54 | pH thresholds acidemia |
| Hawryluk GWJ et al. *ICM* 2022;48:649-66 (BTF 2016) | CPP ≤0 herniación |
| Robba C et al. *Lancet Neurology* 2021 (SYNAPSE-ICU) | CPP <30 isquemia |
| KDIGO AKI 2012 Guidelines | K⁺ >8.5 mEq/L |
| Brown DJA et al. *NEJM* 2012;367:1930-8 | Hipotermia <28°C |
| Bouchama A, Knochel JP. *NEJM* 2002;346:1978-88 | Hipertermia >41.5°C |
| ATLS 10th ed., Chapter 3 | Shock clase IV <2000 mL |
| AHA 2025 ACLS Algorithms | FC <20 / FC >220 |

---

*IMHOTEP UCI — Simulador clínico de cuidados intensivos. Este motor de umbrales es una herramienta didáctica; los valores están calibrados con evidencia pero simplificados para el aprendizaje.*
