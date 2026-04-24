import { LitElement, html, css, svg } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * Lightweight SVG-based SNR time-series chart.
 * Displays neighbor SNR values over time with minimal dependencies.
 */
@customElement('meshcore-snr-chart')
export class SNRChart extends LitElement {
  @property({ type: Array }) data: Array<{ timestamp: number; values: Record<string, number> }> = [];
  @property({ type: Array }) neighbors: string[] = [];
  @property({ type: Number }) width = 600;
  @property({ type: Number }) height = 200;
  @property({ type: Number }) timeRange = 24; // hours

  // 8 sender colors from styles.ts
  private readonly COLORS = [
    '#FF6B6B',
    '#4ECDC4',
    '#FFE66D',
    '#95E1D3',
    '#C7CEEA',
    '#FF8B94',
    '#B5EAD7',
    '#FFB7B2',
  ];

  static styles = css`
    :host {
      display: block;
      width: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    svg {
      width: 100%;
      height: auto;
      display: block;
    }

    .chart-container {
      width: 100%;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      background: var(--input-bg);
      padding: 12px;
      box-sizing: border-box;
    }

    .empty-state {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 200px;
      color: var(--secondary-text-color, #727272);
      font-size: 14px;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }

    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--primary-text-color);
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
  `;

  render() {
    if (!this.data || this.data.length === 0 || this.neighbors.length === 0) {
      return html`
        <div class="chart-container">
          <div class="empty-state">No data available</div>
        </div>
      `;
    }

    const chartSvg = this._renderChart();

    return html`
      <div class="chart-container">
        ${chartSvg}
        <div class="legend">
          ${this.neighbors.map((neighbor, idx) => {
            const color = this.COLORS[idx % this.COLORS.length];
            return html`
              <div class="legend-item">
                <div class="legend-dot" style="background-color: ${color}"></div>
                <span>${neighbor}</span>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  private _renderChart() {
    const padding = 50;
    const chartWidth = this.width - padding * 2;
    const chartHeight = this.height - padding * 2;

    // Find SNR min/max across all data points
    let minSNR = Infinity;
    let maxSNR = -Infinity;

    this.data.forEach((point) => {
      Object.values(point.values).forEach((snr) => {
        if (typeof snr === 'number') {
          minSNR = Math.min(minSNR, snr);
          maxSNR = Math.max(maxSNR, snr);
        }
      });
    });

    // Default range if no data
    if (!isFinite(minSNR) || !isFinite(maxSNR)) {
      minSNR = -10;
      maxSNR = 20;
    }

    // Add padding to range
    const range = maxSNR - minSNR;
    const paddedMin = minSNR - range * 0.1;
    const paddedMax = maxSNR + range * 0.1;

    // Y-axis: SNR dB values
    const yScale = (snr: number) => {
      return (
        this.height - padding - ((snr - paddedMin) / (paddedMax - paddedMin)) * chartHeight
      );
    };

    // X-axis: time
    const timeRange = this.timeRange * 60 * 60 * 1000; // ms
    const now = Date.now();
    const oldestTime = now - timeRange;

    const xScale = (timestamp: number) => {
      return padding + ((timestamp - oldestTime) / timeRange) * chartWidth;
    };

    // Grid lines
    const gridLines = [];
    const yTicks = 5;
    for (let i = 0; i <= yTicks; i++) {
      const snr = paddedMin + (i / yTicks) * (paddedMax - paddedMin);
      const y = yScale(snr);
      gridLines.push(
        svg`
          <line x1="${padding}" y1="${y}" x2="${this.width - padding}" y2="${y}"
            stroke="var(--divider-color, #e0e0e0)" stroke-dasharray="4,4" opacity="0.3" />
          <text x="${padding - 8}" y="${y + 4}" font-size="10" text-anchor="end"
            fill="var(--secondary-text-color, #727272)">${Math.round(snr)}dB</text>
        `
      );
    }

    // Time labels
    const timeLabels = [];
    const timeTicks = 5;
    for (let i = 0; i <= timeTicks; i++) {
      const offset = (i / timeTicks) * timeRange;
      const timestamp = oldestTime + offset;
      const x = xScale(timestamp);
      const label = this._formatTimeLabel(timestamp, now);

      timeLabels.push(
        svg`
          <text x="${x}" y="${this.height - padding + 16}" font-size="10" text-anchor="middle"
            fill="var(--secondary-text-color, #727272)">${label}</text>
        `
      );
    }

    // Data lines
    const paths = this.neighbors.map((neighbor, idx) => {
      const color = this.COLORS[idx % this.COLORS.length];
      const points: string[] = [];

      this.data.forEach((point) => {
        const snr = point.values[neighbor];
        if (typeof snr === 'number' && isFinite(snr)) {
          const x = xScale(point.timestamp);
          const y = yScale(snr);
          points.push(`${x},${y}`);
        }
      });

      if (points.length === 0) return svg``;

      return svg`
        <polyline points="${points.join(' ')}" fill="none" stroke="${color}"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      `;
    });

    return svg`
      <svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
        <!-- Background -->
        <rect width="${this.width}" height="${this.height}" fill="var(--input-bg)" />

        <!-- Grid lines -->
        ${gridLines}

        <!-- Y-axis -->
        <line x1="${padding}" y1="${padding}" x2="${padding}"
          y2="${this.height - padding}" stroke="var(--divider-color, #e0e0e0)" stroke-width="1" />

        <!-- X-axis -->
        <line x1="${padding}" y1="${this.height - padding}"
          x2="${this.width - padding}" y2="${this.height - padding}"
          stroke="var(--divider-color, #e0e0e0)" stroke-width="1" />

        <!-- Data lines -->
        ${paths}

        <!-- Time labels -->
        ${timeLabels}
      </svg>
    `;
  }

  private _formatTimeLabel(timestamp: number, now: number): string {
    const hoursAgo = (now - timestamp) / (60 * 60 * 1000);

    if (hoursAgo >= 24) {
      return `${Math.round(hoursAgo)}h ago`;
    } else if (hoursAgo === 0) {
      return 'Now';
    } else {
      return `${Math.round(hoursAgo)}h`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'meshcore-snr-chart': SNRChart;
  }
}
