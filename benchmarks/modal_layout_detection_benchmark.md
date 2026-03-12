# Layout Detection Benchmark: Modal ONNX (No Acceleration vs L40S GPU)

Performance comparison of the `@nomic/nomic-layout-v1` ONNX predictor on Modal with and without GPU acceleration.

## Test Configuration

- **Predictor**: `@nomic/nomic-layout-v1` (ONNX Runtime)
- **Platform**: Modal
- **No Acceleration**: CPU-only inference
- **L40S GPU**: NVIDIA L40S GPU acceleration
- **Test Documents**: 221 pages across 6 PDFs (wildlife documents + technical drawings)
- **DPI**: 200
- **Detection Threshold**: 0.5 (all classes)

## Wildlife Documents (test-docs-images)

| Document | Pages | No Acceleration | L40S GPU | Speedup |
|----------|-------|-----------------|----------|---------|
| maine-coastal-wildlife.pdf | 10 | 9.22s (0.922s/page) | 4.86s (0.486s/page) | **1.9x** |
| rachel-carson-wildlife.pdf | 8 | 6.80s (0.850s/page) | 3.62s (0.453s/page) | **1.9x** |
| seney-wildlife.pdf | 6 | 4.92s (0.821s/page) | 2.99s (0.498s/page) | **1.6x** |
| wwf-living-planet-2022.pdf | 118 | 88.34s (0.749s/page) | 44.87s (0.380s/page) | **2.0x** |
| **TOTAL** | **142** | **109.28s (0.770s/page)** | **56.34s (0.397s/page)** | **1.94x** ⚡ |

**Total ROIs detected**: 1,118

## Technical Drawings (test-docs-complex)

| Document | Pages | No Acceleration | L40S GPU | Speedup |
|----------|-------|-----------------|----------|---------|
| NIST-Plumbing-Drawings.pdf | 62 | 63.03s (1.017s/page) | 36.90s (0.595s/page) | **1.7x** |
| Reading-PA-HVAC-Bid-Drawings.pdf | 17 | 14.02s (0.825s/page) | 8.63s (0.508s/page) | **1.6x** |
| **TOTAL** | **79** | **77.05s (0.975s/page)** | **45.53s (0.576s/page)** | **1.69x** ⚡ |

**Total ROIs detected**: 820

## Overall Summary

| Document Set | Pages | No Acceleration | L40S GPU | Speedup |
|--------------|-------|-----------------|----------|---------|
| Wildlife docs | 142 | 109.28s (0.770s/page) | 56.34s (0.397s/page) | **1.94x** |
| Technical drawings | 79 | 77.05s (0.975s/page) | 45.53s (0.576s/page) | **1.69x** |
| **COMBINED** | **221** | **186.33s (0.843s/page)** | **101.87s (0.461s/page)** | **1.83x** ⚡ |

## Key Findings

1. **L40S GPU provides ~1.8x average speedup**: Consistent improvement across all document types
   - Best speedup: 2.0x (wwf-living-planet-2022.pdf)
   - Worst speedup: 1.6x (seney-wildlife.pdf, Reading-PA-HVAC-Bid-Drawings.pdf)

2. **Wildlife documents benefit more from GPU acceleration**: 1.94x average speedup vs 1.69x for technical drawings
   - Likely due to simpler layouts and more text-heavy content

3. **Performance with L40S GPU**:
   - Average: 0.461s/page (2.17 pages/second)
   - Range: 0.380s/page (best) to 0.595s/page (worst)

4. **Performance without GPU acceleration**:
   - Average: 0.843s/page (1.19 pages/second)
   - Range: 0.749s/page (best) to 1.017s/page (worst)

5. **Technical drawings are more compute-intensive**: Both configurations show slower per-page processing (0.975s/page CPU, 0.576s/page GPU) compared to wildlife documents

## Comparison with Apple Silicon MLX

For reference, the same documents tested with `@nomic/nomic-layout-v1-mlx` on Apple Silicon (M-series):

| Configuration | Platform | Total Time (221 pages) | Avg per page | Speedup vs Modal CPU |
|---------------|----------|------------------------|--------------|---------------------|
| ONNX (no accel) | Modal CPU | 186.33s | 0.843s | baseline |
| ONNX (L40S GPU) | Modal GPU | 101.87s | 0.461s | 1.83x ⚡ |
| **MLX** | **Apple Silicon** | **50.93s** | **0.230s** | **3.66x** ⚡⚡ |

**Key insight**: Apple Silicon with MLX is **2.0x faster** than Modal L40S GPU and **3.7x faster** than Modal CPU.

## Usage

To reproduce these benchmarks:

```bash
# No acceleration (CPU only)
python3 benchmarks/benchmark_layout.py "@nomic/nomic-layout-v1" "test-docs-images"
python3 benchmarks/benchmark_layout.py "@nomic/nomic-layout-v1" "test-docs-complex"

# With L40S GPU acceleration
# (requires Modal deployment with GPU configuration)
python3 benchmarks/benchmark_layout.py "@nomic/nomic-layout-v1" "test-docs-images"
python3 benchmarks/benchmark_layout.py "@nomic/nomic-layout-v1" "test-docs-complex"
```

## Benchmark Data

Raw benchmark outputs are available in:
- `benchmarks/modal_no_acceleration_images.txt`
- `benchmarks/modal_no_acceleration_complex.txt`
- `benchmarks/modal_l40s_image.txt`
- `benchmarks/modal_l40s_complex.txt`
