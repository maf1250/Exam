import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";

export default function TraineePortalPage() {
  const { slug } = useParams();
  const [collegeData, setCollegeData] = useState(null);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    fetch(`/colleges/${slug}.json`)
      .then((res) => res.json())
      .then(setCollegeData)
      .catch(() => setCollegeData(null));
  }, [slug]);

  if (!collegeData) {
    return <div>❌ لا توجد بيانات لهذه الكلية</div>;
  }

  const handleSearch = () => {
    const found = collegeData.students.find(
      (s) =>
        s.id.includes(search) ||
        s.name.includes(search)
    );
    setResult(found || null);
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>{collegeData.collegeName}</h2>

      <input
        placeholder="اكتب الاسم أو الرقم التدريبي"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <button onClick={handleSearch}>بحث</button>

      {result && (
        <div style={{ marginTop: 20 }}>
          <h3>{result.name}</h3>

          {result.schedule.map((s, i) => (
            <div key={i}>
              {s.courseName} - {s.dayName} - {s.time}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
