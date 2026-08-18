using Feriiz.Web.Models;

namespace Feriiz.Web.Services;

/// <summary>
/// The original Anomali team (12 named people) plus their leave requests and
/// the Indonesian public holidays. Requests and Calendar are a small curated
/// demo for this team, not for the 1.320 generated employees.
/// Ported verbatim from the ANOMALI_* blocks in assets/js/data.js.
/// </summary>
public static class AnomaliDemo
{
    public static readonly IReadOnlyList<Employee> Employees = new List<Employee>
    {
        Emp("ADA27B1B2E650H0X", "Adam Ferial",         "Graphic Design",   "3131", "adam-ferial_1689213258972QWGCYFQ_1770362381449KFDCLNS.jpg"),
        Emp("APR8940K8VB44L8",  "Apriyanto Apriyanto", "Teknisi",          "2714", "apriyanto-apriyanto_1621850525850PHJHHMX_1770362419047ZJYLSJN.jpg"),
        Emp("BILFBY9N8YJ1YDN",  "Baldyas Satrio",      "Graphic Design",   "2218", "baldyas-satrio_1719889375870VXHPKRR_1770005188161PFGYCTG.jpg"),
        Emp("IFAT8WJ2DM",       "Ifan Faizal Adnan",   "Sr.Programmer",    "1840", "ifan-faizal-adnan_1620206785015MBCPYVL_1773047618343SVWDDHF.jpg"),
        Emp("IND693283053999",  "Indra Naftali",       "Manager",          "5190", "indra-naftali_1620292947975SJGDKRW_1770362519575KZRDYJQ.jpg"),
        Emp("MAUNZ1TL5H0Q7GG",  "Mauli Hidayat",       "Marketing",        "7402", "mauli-hidayat_1702870246840CSGXRBZ_1770362636360NSDZCPZ.jpg"),
        Emp("RADVBYR5171FSC6",  "Raden Maulana",       "Frontend",         "6629", "raden-maulana_1620291488566YRBPCKR_1770359737806BBDBVNN.jpg"),
        Emp("STEPRQTY99",       "Steven Febrianto",    "Backend",          "8027", "steven-febrianto_1620206785015NDMGHJW_1770362804080TMPZQVJ.jpg"),
        Emp("VER2FWV8L80S5SX",  "Veronica Nathalia",   "Graphic Design",   "4075", "veronica-nathalia_1672729358803HTZMQXL_1770362780009DWBDQYQ.jpg"),
        Emp("YENX6LH3X9",       "Yenni Tedjakoesoemo", "HR Administrator", "9064", "yenni-tedjokoesoemo_1621590860902KTBPYXR_1770362740255MYSGRLH.jpg"),
        Emp("ZICOJMQN8SQ5RDT",  "Zicky Affan",         "3D Artist",        "5861", "zicky-affan_1684726717948GTJWVGM_1770362757807BGLXFRL.jpg"),
        Emp("SAN79P3WFFK4MQM",  "Sandy Santuy",        "Graphic Design",   "7903", "Sandy Santuy.jfif"),
    };

    public static readonly IReadOnlyList<LeaveRequest> Requests = new List<LeaveRequest>
    {
        Req("REQ-0001", "SAN79P3WFFK4MQM",  "ANM001", "Sick Leave",   "2026-05-04", "Accepted"),
        Req("REQ-0002", "STEPRQTY99",       "ANM001", "Annual Leave", "2026-05-05", "Accepted"),
        Req("REQ-0003", "RADVBYR5171FSC6",  "ANM001", "Sick Leave",   "2026-05-05", "Accepted"),
        Req("REQ-0004", "YENX6LH3X9",       "ANM001", "Remote Work",  "2026-05-06", "Accepted"),
        Req("REQ-0005", "ADA27B1B2E650H0X", "ANM001", "Sick Leave",   "2026-05-06", "Accepted"),
        Req("REQ-0006", "ADA27B1B2E650H0X", "DCG015", "Remote Work",  "2026-05-07", "Accepted"),
        Req("REQ-0007", "MAUNZ1TL5H0Q7GG",  "DCG015", "Annual Leave", "2026-05-11", "Accepted"),
        Req("REQ-0008", "IFAT8WJ2DM",       "ANM001", "Annual Leave", "2026-05-12", "Accepted"),
        Req("REQ-0009", "RADVBYR5171FSC6",  "ANM001", "Sick Leave",   "2026-05-04", "Accepted"),
        Req("REQ-0010", "IFAT8WJ2DM",       "ANM001", "Remote Work",  "2026-05-13", "Pending"),
        Req("REQ-0011", "MAUNZ1TL5H0Q7GG",  "DCG015", "Sick Leave",   "2026-05-13", "Pending"),
        Req("REQ-0012", "MAUNZ1TL5H0Q7GG",  "ANM001", "Annual Leave", "2026-05-08", "Accepted"),
        Req("REQ-0013", "VER2FWV8L80S5SX",  "ANM001", "Annual Leave", "2026-05-15", "Accepted"),
        Req("REQ-0014", "STEPRQTY99",       "DGH105", "Remote Work",  "2026-05-06", "Accepted"),
        Req("REQ-0015", "ZICOJMQN8SQ5RDT",  "ANM001", "Remote Work",  "2026-05-07", "Accepted"),
        Req("REQ-0016", "BILFBY9N8YJ1YDN",  "DCG015", "Remote Work",  "2026-05-13", "Accepted"),
        Req("REQ-0017", "IND693283053999",  "ANM001", "Remote Work",  "2026-05-13", "Accepted"),
        Req("REQ-0018", "APR8940K8VB44L8",  "DGH105", "Sick Leave",   "2026-05-13", "Accepted"),
    };

    public static readonly IReadOnlyList<Holiday> Holidays = new List<Holiday>
    {
        new() { Name = "Hari Buruh Internasional", Date = "2026-05-01", Type = "national" },
        new() { Name = "Kenaikan Isa Al Masih",    Date = "2026-05-14", Type = "national" },
        new() { Name = "Idul Adha (Lebaran Haji)", Date = "2026-05-27", Type = "national" },
        new() { Name = "Idul Adha (Lebaran Haji)", Date = "2026-05-28", Type = "national" },
        new() { Name = "Hari Raya Waisak",         Date = "2026-05-31", Type = "national" },
    };

    /// <summary>Project codes referenced by the demo requests, for the calendar label.</summary>
    public static readonly IReadOnlyDictionary<string, string> ProjectLabels =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["ANM001"] = "Anomali",
            ["DCG015"] = "Diamond Crystal Golf No. 15",
            ["DGH105"] = "Diamond Golf H3 No. 105",
        };

    private static Employee Emp(string code, string name, string occupation, string pin, string photoFile) =>
        new() { Code = code, Name = name, Occupation = occupation, Pin = pin, PhotoFile = photoFile };

    private static LeaveRequest Req(string id, string code, string project, string type, string date, string status) =>
        new()
        {
            Id = id,
            EmployeeCode = code,
            ProjectCode = project,
            Type = type,
            DateStart = date,
            DateEnd = date,
            Status = status,
            Pic = "Judith Anastalio",
            SubmittedAt = DateTimeOffset.Parse($"{date}T08:00:00+07:00"),
            Reason = "",
        };
}
