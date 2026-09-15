import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { DropdownModule } from 'primeng/dropdown';
import { FormsModule } from '@angular/forms';
import { TagModule } from 'primeng/tag';
import { StatsService } from '../../core/services/stats.service';
import { DashboardStats, TimeSeries, TopItem, TopUser } from '../../core/models/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, CardModule, ChartModule, DropdownModule, FormsModule, TagModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private readonly stats = inject(StatsService);

  dashboard = signal<DashboardStats | null>(null);
  topItems = signal<TopItem[]>([]);
  topUsers = signal<TopUser[]>([]);
  chartData: any = null;
  chartOptions: any = null;
  seriesError = signal<string | null>(null);

  granularities = [
    { label: 'Heure', value: 'hour' },
    { label: 'Jour', value: 'day' },
    { label: 'Semaine', value: 'week' }
  ];
  selectedGranularity = 'day';
  selectedMetric = 'purchases';

  // Values must match AdminStatsService.getTimeSeries's metric.toUpperCase()
  // switch exactly (case-insensitive, but not the spelling) — REGISTRATIONS/
  // CONNECTIONS/PURCHASES/KREDS/DEDITOONS, nothing else, everything else 400s.
  metrics = [
    { label: 'Achats', value: 'purchases' },
    { label: 'Kreds dépensés', value: 'kreds' },
    { label: 'Connexions', value: 'connections' }
  ];

  ngOnInit() {
    this.loadDashboard();
    this.loadSeries();
    this.stats.topItems(10).subscribe(d => this.topItems.set(d));
    this.stats.topUsers(10).subscribe(d => this.topUsers.set(d));
  }

  loadDashboard() {
    this.stats.dashboard().subscribe(d => this.dashboard.set(d));
  }

  loadSeries() {
    const to = new Date();
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    this.seriesError.set(null);
    this.stats.timeSeries(this.selectedMetric, from.toISOString(), to.toISOString(), this.selectedGranularity)
      .subscribe({
        next: (ts: TimeSeries) => this.buildChart(ts),
        // Was silently swallowed before — the chart just kept showing the
        // previous metric's stale data with no indication anything failed.
        error: () => { this.chartData = null; this.seriesError.set('Impossible de charger cette métrique.'); },
      });
  }

  buildChart(ts: TimeSeries) {
    this.chartData = {
      labels: ts.points.map(p => {
        const d = new Date(p.period);
        return d.toLocaleDateString('fr-FR');
      }),
      datasets: [{
        label: ts.metric,
        data: ts.points.map(p => p.count),
        fill: true,
        backgroundColor: 'rgba(99,102,241,0.2)',
        borderColor: '#6366f1',
        tension: 0.4
      }]
    };
    this.chartOptions = {
      plugins: { legend: { labels: { color: '#d1d5db' } } },
      scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } },
        y: { ticks: { color: '#9ca3af' }, grid: { color: '#374151' } }
      }
    };
  }
}
