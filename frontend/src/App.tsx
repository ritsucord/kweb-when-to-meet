import { BrowserRouter, Route, Routes } from 'react-router'
import HomePage from './pages/HomePage.tsx'

// 화면(페이지)과 URL 경로를 연결하는 곳. 페이지가 늘어나면 여기에 Route를 추가한다.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  )
}
