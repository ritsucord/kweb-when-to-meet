import type { ReactNode } from 'react'
import { toast } from 'sonner'
import type { CalendarEvent } from 'shared'
import { ConfirmAction } from '@/components/ConfirmAction'
import { Empty, Facts, Rows, Section, TableHead } from '@/components/editorial'
import { FormField } from '@/components/FormField'
import { Logo } from '@/components/Logo'
import { PageHeader } from '@/components/PageHeader'
import RoleBadge, { StatusBadge } from '@/components/RoleBadge'
import { ThemeToggle } from '@/components/theme'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CalendarGrid } from '@/events/CalendarGrid'
import { addDays, startOfWeek } from '@/events/week'
import { cn } from '@/lib/utils'

const SECTIONS = [
  ['rules', '원칙'],
  ['tokens', '토큰'],
  ['type', '타이포그래피'],
  ['controls', '버튼·입력'],
  ['labels', '라벨'],
  ['lists', '목록·표'],
  ['selection', '선택 상태'],
  ['overlays', '대화상자·시트'],
  ['calendar', '캘린더'],
  ['responsive', '반응형'],
] as const

/** KUrdination 디자인 시스템 문서 (frontend/design-system.html) — 에디토리얼 */
export default function DesignSystemPage() {
  return (
    <div className="mx-auto min-h-dvh max-w-[1320px] px-4 md:px-8 xl:px-12">
      <header className="flex h-16 items-center gap-4 border-b-2 border-ink">
        <Logo className="text-2xl" />
        <span className="eyebrow hidden sm:inline">Design System</span>
        <span className="flex-1" />
        <a href="/" className="hidden text-sm font-medium underline underline-offset-4 md:inline">앱으로</a>
        <ThemeToggle />
      </header>

      <div className="grid gap-12 py-10 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav className="hidden lg:block" aria-label="목차">
          <ol className="sticky top-10 border-t border-ink">
            {SECTIONS.map(([id, label], i) => (
              <li key={id} className="border-b border-line">
                <a href={`#${id}`} className="flex gap-3 py-2 text-sm hover:underline hover:underline-offset-4">
                  <span className="num text-ink-soft">{String(i + 1).padStart(2, '0')}</span>{label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-w-0 space-y-16">
          <PageHeader title="KUrdination 디자인 시스템" lead="에디토리얼 방향. 흑백 지면 위에 1px 선으로 구획하고, 포인트 빨강은 좁은 면적에만 씁니다. 컴포넌트 기반은 shadcn/ui(Radix) + Tailwind CSS v4이며, 모든 값은 src/index.css의 토큰에서 나옵니다." />
          <Rules />
          <Tokens />
          <Type />
          <Controls />
          <Labels />
          <Lists />
          <Selection />
          <Overlays />
          <Calendar />
          <Responsive />
        </main>
      </div>
    </div>
  )
}

function Anchor({ id }: { id: string }) {
  return <span id={id} className="block scroll-mt-10" />
}

/** 라이트와 다크를 나란히: 세로 1px 선으로만 나눈다. 감싼 div의 class로 그 안의 토큰만 바꾼다. */
function BothThemes({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="grid border-y border-line xl:grid-cols-2 xl:divide-x xl:divide-line">
      {(['light', 'dark'] as const).map((mode) => (
        <div key={mode} className={cn(mode, 'bg-paper p-6 text-ink')}>
          <p className="eyebrow mb-4">{mode === 'light' ? '라이트 · 기본' : '다크'}</p>
          <div className={className}>{children}</div>
        </div>
      ))}
    </div>
  )
}

function Code({ children }: { children: ReactNode }) {
  return <code className="num bg-muted px-1 text-[0.85em]">{children}</code>
}

// ---------------------------------------------------------------

function Rules() {
  const dos = [
    ['구획', '카드 대신 1px 선. 구역 시작은 잉크 1px, 페이지 제목 아래는 잉크 2px.'],
    ['모서리', '0~4px. 기본 2px.'],
    ['포인트', 'KU 크림슨 한 색. 오늘·현재 시각·개수·위험 동작에만, 좁게.'],
    ['상태 칸', '확정/미확정처럼 구분이 꼭 필요한 칸만 배경색(초록·황토).'],
    ['선택', '반전(잉크 바탕 + 지면 글자) 하나로 통일.'],
    ['숫자', '날짜·시각·개수는 고정폭(IBM Plex Mono) + tabular-nums.'],
  ]
  const donts = ['연한 틴트 배경으로 선택 표시 (배경색은 상태 구분에만)', '흰 카드 + 그림자로 감싸기', '메뉴·탭·배지의 습관적 아이콘', '원형 이니셜 아바타', '제목 아래 회색 설명, "A · B · C" 메타 줄', '그라데이션·블러·호버 애니메이션']
  return (
    <div>
      <Anchor id="rules" />
      <Section title="원칙">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <p className="eyebrow mb-2">한다</p>
            <Facts items={dos.map(([label, value]) => ({ label, value }))} />
          </div>
          <div>
            <p className="eyebrow mb-2">하지 않는다</p>
            <Rows>{donts.map((d) => <li key={d} className="py-3 line-through decoration-accent-ink decoration-1">{d}</li>)}</Rows>
          </div>
        </div>
      </Section>
    </div>
  )
}

const TOKENS = [
  ['paper', '바탕', '#fbfaf7', '#121110'],
  ['ink', '글자·선택 반전·주 버튼', '#151413', '#ece8df'],
  ['ink-soft', '시각 눈금·자리표시자', '#66625b', '#a29d93'],
  ['line', '1px 구획선', '#d6d2c8', '#34312c'],
  ['accent-ink', '포인트(오늘·개수·위험)', '#a6192e', '#f0575f'],
  ['confirmed', '확정 칸 (글자 confirmed-ink)', '#2d5c44', '#4f9a72'],
  ['tentative', '미확정 칸 (글자 tentative-ink, 점선 tentative-line)', '#f2e6c6', '#3a301c'],
]

function Tokens() {
  return (
    <div>
      <Anchor id="tokens" />
      <Section title="토큰">
        <TableHead columns="120px minmax(0,1fr) 120px 120px" cols={['이름', '용도', '라이트', '다크']} />
        <Rows className="border-t-0">
          {TOKENS.map(([name, use, light, dark]) => (
            <li key={name} className="grid grid-cols-2 items-center gap-x-4 gap-y-1 py-3 md:grid-cols-[120px_minmax(0,1fr)_120px_120px]">
              <span className="num font-semibold">{name}</span>
              <span className="text-sm">{use}</span>
              <span className="num flex items-center gap-2 text-sm"><span className="size-4 border border-ink" style={{ background: light }} />{light}</span>
              <span className="num flex items-center gap-2 text-sm"><span className="size-4 border border-ink" style={{ background: dark }} />{dark}</span>
            </li>
          ))}
        </Rows>
        <div className="mt-8 grid gap-12 md:grid-cols-2">
          <Facts items={[
            { label: '모서리', value: <span className="num">0 · 1 · 2 · 3 · 4px</span> },
            { label: '그림자', value: '없음' },
            { label: '간격', value: <span className="num">4 · 8 · 12 · 16 · 24 · 32 · 48px</span> },
          ]} />
          <Facts items={[
            { label: '제목', value: <span className="font-serif font-bold">Noto Serif KR 명조</span> },
            { label: '본문', value: 'Pretendard 15px / 1.6' },
            { label: '숫자', value: <span className="num">IBM Plex Mono 0123456789</span> },
          ]} />
        </div>
      </Section>
    </div>
  )
}

function Type() {
  const scale: [string, string, string][] = [
    ['font-serif text-[2.5rem] leading-tight font-bold', '페이지 제목', '40 · 명조 Bold · 휴대폰 30'],
    ['font-serif text-2xl font-bold', '목록의 조직명·일정 제목', '24 · 명조 Bold'],
    ['font-serif text-lg font-bold', '구역 제목', '18 · 명조 Bold'],
    ['text-[0.9375rem]', '본문', '15 · Pretendard Regular'],
    ['text-sm font-semibold', '라벨·버튼', '14 · Pretendard Semibold'],
    ['eyebrow', '표 머리·구역 이름', '12 · Semibold · 자간 0.08em'],
    ['num text-xl font-semibold', '2026.11.09 – 11.15  10:00', '고정폭 숫자'],
  ]
  return (
    <div>
      <Anchor id="type" />
      <Section title="타이포그래피">
        <Rows>
          {scale.map(([cls, sample, spec]) => (
            <li key={spec} className="grid gap-1 py-4 md:grid-cols-[minmax(0,1fr)_240px] md:items-baseline">
              <span className={cn(cls, 'text-ink')}>{sample}</span>
              <span className="num text-sm text-ink-soft">{spec}</span>
            </li>
          ))}
        </Rows>
      </Section>
    </div>
  )
}

function Controls() {
  return (
    <div>
      <Anchor id="controls" />
      <Section title="버튼·입력">
        <BothThemes className="grid gap-8">
          <div className="flex flex-wrap items-center gap-3">
            <Button>주 동작</Button>
            <Button variant="outline">보조 동작</Button>
            <Button variant="ghost">글자 버튼</Button>
            <Button variant="destructive">삭제</Button>
            <Button variant="link">링크</Button>
            <Button disabled>비활성</Button>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <FormField label="이메일"><Input type="email" placeholder="you@korea.ac.kr" /></FormField>
            <FormField label="이름" error="이름은 1~50자로 입력해 주세요."><Input /></FormField>
            <div className="flex flex-wrap items-end gap-3">
              <Select defaultValue="all">
                <SelectTrigger className="w-[128px]" aria-label="상태 필터"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  <SelectItem value="confirmed">확정만</SelectItem>
                </SelectContent>
              </Select>
              <Toggle variant="outline" defaultPressed className="h-10 px-3">내 참여만</Toggle>
            </div>
            <ToggleGroup type="single" variant="outline" defaultValue="tentative" className="w-full">
              <ToggleGroupItem value="tentative" className="h-10 flex-1">미확정</ToggleGroupItem>
              <ToggleGroupItem value="confirmed" className="h-10 flex-1">확정</ToggleGroupItem>
            </ToggleGroup>
            <label className="flex items-center gap-2.5"><Checkbox defaultChecked />김크림 <span className="text-ink-soft">나</span></label>
          </div>
          <div className="grid gap-3">
            <Alert variant="destructive"><AlertTitle>조직을 열 수 없습니다</AlertTitle><AlertDescription>이 조직의 멤버가 아닙니다.</AlertDescription></Alert>
            <Alert><AlertDescription>가입이 완료되었습니다. 로그인해 주세요.</AlertDescription></Alert>
          </div>
        </BothThemes>
      </Section>
    </div>
  )
}

function Labels() {
  return (
    <div>
      <Anchor id="labels" />
      <Section title="라벨">
        <BothThemes className="flex flex-wrap items-center gap-6">
          <span className="flex items-center gap-2"><StatusBadge status="confirmed" /><span className="text-sm">초록 칸 = 확정</span></span>
          <span className="flex items-center gap-2"><StatusBadge status="tentative" /><span className="text-sm">황토 칸 + 점선 = 미확정</span></span>
          <span className="flex items-center gap-2"><RoleBadge role="admin" /><span className="text-sm">= 빨강 글자</span></span>
          <span className="flex items-center gap-2"><RoleBadge role="member" /><span className="text-sm">= 보조 글자</span></span>
        </BothThemes>
      </Section>
    </div>
  )
}

function Lists() {
  const cols = 'minmax(0,1fr) 88px 104px'
  return (
    <div>
      <Anchor id="lists" />
      <Section title="목록·표" aside={<span className="num text-sm">3명</span>}>
        <p className="mb-6">목록은 카드 없이 1px 구분선으로만 나눕니다. md 이상에서는 표 머리(eyebrow)를 보이고, 같은 grid 템플릿으로 열을 맞춥니다.</p>
        <TableHead columns={cols} cols={['이름', '역할', '']} />
        <Rows className="border-t-0">
          {[['김크림', 'admin'], ['박안암', 'member'], ['이호랑', 'member']].map(([n, r], i) => (
            <li key={n} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3 md:grid-cols-[minmax(0,1fr)_88px_104px]">
              <span className="font-semibold">{n}{i === 0 && <span className="ml-2 text-sm font-normal text-ink-soft">나</span>}</span>
              <RoleBadge role={r as 'admin' | 'member'} />
              <span className="hidden justify-end md:flex">{i > 0 && <Button variant="outline" size="sm">내보내기</Button>}</span>
            </li>
          ))}
        </Rows>
        <div className="mt-8"><Empty action={<Button>새 조직</Button>}>아직 속한 조직이 없습니다.</Empty></div>
      </Section>
    </div>
  )
}

function Selection() {
  return (
    <div>
      <Anchor id="selection" />
      <Section title="선택 상태 — 반전 하나로">
        <BothThemes className="grid gap-6 md:grid-cols-3">
          <ul className="grid">
            <li className="selected -mx-2 flex h-9 items-center px-2 font-semibold">내 조직</li>
            <li className="-mx-2 flex h-9 items-center justify-between px-2">받은 초대 <span className="num text-sm font-semibold text-accent-ink">2</span></li>
          </ul>
          <div className="flex border-y-2 border-ink">
            <span className="selected inline-flex h-11 items-center px-5 font-semibold">일정</span>
            <span className="inline-flex h-11 items-center border-r border-line px-5">멤버 <span className="num ml-1.5">3</span></span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line border-y-2 border-ink text-center">
            {[['월', 9], ['화', 10], ['수', 11]].map(([d, n], i) => (
              <span key={d} className={cn('py-2', i === 1 && 'selected')}>
                <span className="block text-xs">{d}</span><span className="num text-lg font-semibold">{n}</span>
              </span>
            ))}
          </div>
        </BothThemes>
      </Section>
    </div>
  )
}

function Overlays() {
  return (
    <div>
      <Anchor id="overlays" />
      <Section title="대화상자·시트">
        <p className="mb-6">짧은 입력은 Dialog, 확인은 ConfirmAction(AlertDialog), 일정 상세·만들기는 데스크톱 옆 패널 → 태블릿 오른쪽 시트 → 휴대폰 아래 시트.</p>
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">Dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader className="border-b border-ink pb-3">
                <DialogTitle>새 조직</DialogTitle>
                <DialogDescription className="sr-only">예시</DialogDescription>
              </DialogHeader>
              <FormField label="이름"><Input placeholder="KWEB 스터디" /></FormField>
              <DialogFooter><Button>만들기</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          <ConfirmAction
            trigger={<Button variant="outline">ConfirmAction</Button>}
            title="조직을 삭제할까요?"
            description={<p>모든 멤버와 일정이 사라집니다.</p>}
            confirmLabel="영구 삭제"
            onConfirm={async () => { toast.success('(예시) 삭제했습니다.') }}
            describeError={() => '오류'}
          />
          {(['right', 'bottom'] as const).map((side) => (
            <Sheet key={side}>
              <SheetTrigger asChild><Button variant="outline">Sheet {side === 'right' ? '태블릿' : '휴대폰'}</Button></SheetTrigger>
              <SheetContent side={side} className={side === 'bottom' ? 'max-h-[80dvh]' : 'sm:max-w-md'}>
                <SheetHeader className="border-b-2 border-ink">
                  <SheetTitle>일정 상세</SheetTitle>
                  <SheetDescription className="sr-only">예시</SheetDescription>
                </SheetHeader>
                <div className="px-4 pb-6"><StatusBadge status="confirmed" /><p className="mt-2 font-serif text-2xl font-bold">주간 스터디</p></div>
              </SheetContent>
            </Sheet>
          ))}
          <Button variant="outline" onClick={() => toast.success('일정을 만들었습니다.')}>토스트</Button>
        </div>
      </Section>
    </div>
  )
}

function Calendar() {
  const week = startOfWeek(new Date())
  const at = (day: number, h: number) => { const d = addDays(week, day); d.setHours(h, 0, 0, 0); return d.toISOString() }
  const ev = (id: string, title: string | null, day: number, s: number, e: number, status: 'confirmed' | 'tentative', n = 1): CalendarEvent =>
    ({ id, title, start: at(day, s), end: at(day, e), status, createdBy: 'u', participants: Array.from({ length: n }, (_, i) => `u${i}`) })
  const events = [
    ev('a', '주간 스터디', 1, 10, 12, 'confirmed', 4),
    ev('b', '가능한 시간', 1, 11, 13, 'tentative'),
    ev('c', '가능한 시간', 2, 14, 17, 'tentative'),
    ev('d', '코드 리뷰', 3, 9, 10, 'confirmed', 3),
    ev('e', null, 4, 15, 16, 'tentative', 2),
  ]
  return (
    <div>
      <Anchor id="calendar" />
      <Section title="캘린더">
        <p className="mb-6">구분이 필요한 칸만 칠합니다: 확정은 초록 칸, 미확정은 황토 칸 + 점선, 선택은 반전. 오늘은 머리글의 빨강 2px 선과 빨강 날짜, 현재 시각은 빨강 1px 선으로 표시하고 열 바탕은 칠하지 않습니다.</p>
        <CalendarGrid
          days={Array.from({ length: 7 }, (_, i) => addDays(week, i))}
          events={events}
          selectedId="d"
          onSelect={(e) => toast(`${e.title ?? '(제목 없음)'} 선택`)}
          onSlotClick={(d) => toast(`${d.getHours()}시 칸 선택`)}
        />
      </Section>
    </div>
  )
}

function Responsive() {
  const cols = '120px repeat(3, minmax(0,1fr))'
  const rows: [string, string, string, string][] = [
    ['앱 틀', '상단 바 + ☰ 시트', '상단 바 + ☰ 시트 (1024부터 사이드바)', '사이드바 고정'],
    ['내 조직', '1열 목록 (번호·이름 / 역할)', '표 3열', '표 3열'],
    ['멤버·초대', '위아래로 쌓기', '1024부터 8:4 두 단 + 세로선', '8:4 두 단 + 세로선'],
    ['일정', '날짜 줄 + 하루 보기, 아래 시트', '주간 보기 + 아래 목록, 오른쪽 시트', '주간 보기 + 오른쪽 패널'],
  ]
  return (
    <div>
      <Anchor id="responsive" />
      <Section title="반응형">
        <p className="mb-6">브레이크포인트는 Tailwind 기본값. 스타일만 바뀌면 <Code>md:</Code> <Code>lg:</Code> <Code>xl:</Code> 클래스, 그리는 컴포넌트가 바뀌면(패널 ↔ 시트) <Code>useMediaQuery</Code>.</p>
        <TableHead columns={cols} cols={['', '휴대폰 ~767', '태블릿 768~1279', '데스크톱 1280~']} />
        <Rows className="border-t-0">
          {rows.map(([k, ...v]) => (
            <li key={k} className="grid gap-x-4 gap-y-1 py-3 md:grid-cols-[120px_repeat(3,minmax(0,1fr))]">
              <span className="font-semibold">{k}</span>
              {v.map((x, i) => <span key={i} className="text-sm"><span className="eyebrow mr-2 md:hidden">{['휴대폰', '태블릿', '데스크톱'][i]}</span>{x}</span>)}
            </li>
          ))}
        </Rows>
      </Section>
    </div>
  )
}
