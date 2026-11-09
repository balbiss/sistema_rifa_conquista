import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend, ArcElement } from 'chart.js'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import { dayShort } from '../lib/fmt'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, Tooltip, Legend, ArcElement)
ChartJS.defaults.font.family = "'PT Sans', Arial, sans-serif"
ChartJS.defaults.color = '#92989B'

const grid = { color: '#EEF0F2' }
const tooltip = { backgroundColor: '#313942', padding: 10, cornerRadius: 3, titleFont: { weight: 'bold' as const } }

/** Barras empilhadas por dia: real (vinho) x simulação (âmbar). */
export function DailyBars({ data, realKey, simKey, height = 230, labels = ['Reais', 'Simulação'] }: { data: any[]; realKey: string; simKey?: string; height?: number; labels?: [string, string] | string[] }) {
  const real = data.map(d => (d[realKey] || 0) - (simKey ? d[simKey] || 0 : 0))
  const datasets: any[] = [{ label: labels[0], data: real, backgroundColor: '#1458D4', borderRadius: 2, stack: 's' }]
  if (simKey) datasets.push({ label: labels[1], data: data.map(d => d[simKey] || 0), backgroundColor: '#e7bd66', borderRadius: 2, stack: 's' })
  return (
    <div style={{ height }}>
      <Bar data={{ labels: data.map(d => dayShort(d.d)), datasets }}
        options={{ maintainAspectRatio: false, animation: { duration: 500 }, plugins: { legend: { display: !!simKey, position: 'bottom', labels: { boxWidth: 10 } }, tooltip }, scales: { x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { stacked: true, grid, beginAtZero: true, ticks: { precision: 0 } } } }} />
    </div>
  )
}

export function TwoLines({ data, a, b, height = 230 }: { data: any[]; a: [string, string]; b: [string, string]; height?: number }) {
  return (
    <div style={{ height }}>
      <Line data={{ labels: data.map(d => dayShort(d.d)), datasets: [
        { label: a[1], data: data.map(d => d[a[0]]), borderColor: '#1458D4', backgroundColor: 'rgba(200,80,106,.12)', fill: true, tension: .35, pointRadius: 0, borderWidth: 2 },
        { label: b[1], data: data.map(d => d[b[0]]), borderColor: '#0B1730', backgroundColor: 'transparent', tension: .35, pointRadius: 0, borderWidth: 2 },
      ] }}
        options={{ maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { grid, beginAtZero: true, ticks: { precision: 0 } } } }} />
    </div>
  )
}

export function Donut({ labels, values, colors, height = 200 }: { labels: string[]; values: number[]; colors: string[]; height?: number }) {
  return (
    <div style={{ height }}>
      <Doughnut data={{ labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] }}
        options={{ maintainAspectRatio: false, cutout: '68%', plugins: { legend: { position: 'right', labels: { boxWidth: 10 } }, tooltip } }} />
    </div>
  )
}
