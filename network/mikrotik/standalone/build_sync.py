"""Generates juthelink-sync.rsc: the router polls the Juthelink website every 10 s and creates/removes
the hotspot logins customers bought online, runs staff commands (disconnect, pause, block, speed),
reports online devices every 30 s, and blocks hotspot sharing. No VPN needed (works behind Starlink CGNAT).

Usage:  python3 network/mikrotik/standalone/build_sync.py https://your-site.vercel.app YOUR_ROUTER_PULL_KEY
Then upload juthelink-sync.rsc to the router (Files) and run:  /import file-name=juthelink-sync.rsc
"""
import re
import sys
from pathlib import Path

SCRIPT = r''':local data ""
:local got false
:do {
  :set data ([/tool fetch url="PULLURL" output=user as-value check-certificate=no]->"data")
  :set got true
} on-error={ :log warning "juthelink-sync: website not reachable" }
:if ($got) do={
  :local done ""
  :local cdone ""
  :while ([:len $data] > 0) do={
    :local nl [:find $data "\n"]
    :local line ""
    :if ([:typeof $nl] = "nil") do={ :set line $data; :set data "" } else={ :set line [:pick $data 0 $nl]; :set data [:pick $data ($nl + 1) [:len $data]] }
    :local c1 [:find $line ","]
    :if ([:typeof $c1] = "num") do={
      :local cmd [:pick $line 0 $c1]
      :local rest [:pick $line ($c1 + 1) [:len $line]]
      :if ($cmd = "d") do={
        :do { /ip hotspot active remove [find where user=$rest] } on-error={}
        :do { /ip hotspot cookie remove [find where user=$rest] } on-error={}
        :do { /ip hotspot user remove [find where name=$rest] } on-error={}
        :do { /system scheduler remove [find where name=("exp-" . $rest)] } on-error={}
        :set done ($done . $rest . ".")
      }
      :if ($cmd = "a") do={
        :local c2 [:find $rest ","]
        :local u [:pick $rest 0 $c2]
        :set rest [:pick $rest ($c2 + 1) [:len $rest]]
        :local c3 [:find $rest ","]
        :local p [:pick $rest 0 $c3]
        :set rest [:pick $rest ($c3 + 1) [:len $rest]]
        :local c4 [:find $rest ","]
        :local prof [:pick $rest 0 $c4]
        :set rest [:pick $rest ($c4 + 1) [:len $rest]]
        :local c5 [:find $rest ","]
        :local ph [:pick $rest 0 $c5]
        :local lim [:pick $rest ($c5 + 1) [:len $rest]]
        :do {
          :local id [/ip hotspot user find where name=$u]
          :if ([:len $id] = 0) do={ /ip hotspot user add name=$u password=$p profile=$prof comment=$ph limit-bytes-total=$lim } else={ /ip hotspot user set $id password=$p profile=$prof limit-bytes-total=$lim }
          :set done ($done . $u . ".")
        } on-error={ :log warning ("juthelink-sync: could not add " . $u . " (profile " . $prof . ")") }
      }
      :if ($cmd = "c") do={
        :local c2 [:find $rest ","]
        :local cid [:pick $rest 0 $c2]
        :set rest [:pick $rest ($c2 + 1) [:len $rest]]
        :local c3 [:find $rest ","]
        :local act [:pick $rest 0 $c3]
        :local arg [:pick $rest ($c3 + 1) [:len $rest]]
        :do {
          :if ($act = "k" || $act = "p") do={
            :do { /ip hotspot active remove [find where user=$arg] } on-error={}
            :do { /ip hotspot cookie remove [find where user=$arg] } on-error={}
          }
          :if ($act = "q") do={ :do { /ip hotspot active remove [find where user=$arg] } on-error={} }
          :if ($act = "p") do={
            :do { /ip hotspot user disable [find where name=$arg] } on-error={}
            :do { /system scheduler remove [find where name=("exp-" . $arg)] } on-error={}
          }
          :if ($act = "r") do={ :do { /ip hotspot user enable [find where name=$arg] } on-error={} }
          :if ($act = "b") do={
            :if ([:len [/ip hotspot ip-binding find where mac-address=$arg]] = 0) do={ /ip hotspot ip-binding add mac-address=$arg type=blocked comment="Juthelink: blocked device" } else={ /ip hotspot ip-binding set [find where mac-address=$arg] type=blocked }
            :do { /ip hotspot active remove [find where mac-address=$arg] } on-error={}
            :do { /ip hotspot host remove [find where mac-address=$arg] } on-error={}
          }
          :if ($act = "u") do={ :do { /ip hotspot ip-binding remove [find where mac-address=$arg and type=blocked] } on-error={} }
          :set cdone ($cdone . $cid . ".")
        } on-error={ :log warning ("juthelink-sync: command failed " . $act . " " . $arg) }
      }
    }
  }
  :if ([:len ($done . $cdone)] > 0) do={
    :do { /tool fetch url=("PULLURL&ok=" . $done . "&c=" . $cdone) output=user as-value check-certificate=no } on-error={ :log warning "juthelink-sync: could not confirm" }
  }
}'''

# Every ~30 s: the list of logged-in devices for the admin "Online now" page.
REPORT = r''':local out ""
:foreach i in=[/ip hotspot active find] do={
  :do {
    :set out ($out . $i . "," . [/ip hotspot active get $i user] . "," . [/ip hotspot active get $i mac-address] . "," . [/ip hotspot active get $i address] . "," . [/ip hotspot active get $i uptime] . "," . [/ip hotspot active get $i bytes-in] . "," . [/ip hotspot active get $i bytes-out] . "\n")
  } on-error={}
}
:if ([:len $out] = 0) do={ :set out "none" }
:do { /tool fetch url="REPORTURL" http-method=post http-data=$out output=none check-certificate=no } on-error={ :log warning "juthelink-report: website not reachable" }'''

# Speed tiers staff can give one login (must match SPEED_TIERS in src/server/network/commands.ts).
SPEED_TIERS = [("slow", "1M/2M"), ("normal", "2M/5M"), ("fast", "4M/10M"), ("max", "8M/20M")]

# Same one-device rule as the plan profiles (see build_profiles.py).
KICK_OTHERS = r''':local u $user
:local m $"mac-address"
:foreach i in=[/ip hotspot active find where user=$u and mac-address!=$m] do={:do {/ip hotspot active remove $i} on-error={}}
:do {/ip hotspot cookie remove [find where user=$u and mac-address!=$m]} on-error={}'''


def ros_quote(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("$", "\\$").replace("\n", "\\r\\n") + '"'


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    base, key = sys.argv[1].rstrip("/"), sys.argv[2]
    if not re.fullmatch(r"https?://[A-Za-z0-9.:-]+", base):
        sys.exit("The website address must look like https://your-site.vercel.app (no path)")
    if not re.fullmatch(r"[A-Za-z0-9_-]{24,}", key):
        sys.exit("The key must be the ROUTER_PULL_KEY (24+ letters/numbers)")
    host = re.sub(r"^https?://", "", base).split(":")[0]
    source = SCRIPT.replace("PULLURL", f"{base}/api/router/pull?key={key}")
    report = REPORT.replace("REPORTURL", f"{base}/api/router/report?key={key}")
    out = [
        "# Juthelink - automatic logins, device report, speed tiers and no-sharing rule (generated by build_sync.py). Safe to import again.",
        ':do { /system scheduler remove [find where name="juthelink-sync"] } on-error={}',
        ':do { /system script remove [find where name="juthelink-sync"] } on-error={}',
        f"/system script add name=juthelink-sync policy=read,write,test source={ros_quote(source)}",
        '/system scheduler add name=juthelink-sync interval=10s on-event="/system script run juthelink-sync" policy=read,write,test comment="Juthelink: fetch new logins and commands"',
        ':do { /system scheduler remove [find where name="juthelink-report"] } on-error={}',
        ':do { /system script remove [find where name="juthelink-report"] } on-error={}',
        f"/system script add name=juthelink-report policy=read,write,test source={ros_quote(report)}",
        '/system scheduler add name=juthelink-report interval=30s on-event="/system script run juthelink-report" policy=read,write,test comment="Juthelink: report online devices"',
        f':if ([:len [/ip hotspot walled-garden ip find where dst-host="{host}"]] = 0) do={{ /ip hotspot walled-garden ip add action=accept dst-host="{host}" comment="Juthelink website (before login)" }}',
    ]
    for tier, rate in SPEED_TIERS:
        name = f"jl-{tier}"
        out += [
            f':if ([:len [/ip hotspot user profile find where name="{name}"]] = 0) do={{ /ip hotspot user profile add name="{name}" }}',
            f'/ip hotspot user profile set [find where name="{name}"] shared-users=2 rate-limit={rate} idle-timeout=none keepalive-timeout=3h '
            f"status-autorefresh=1m add-mac-cookie=yes mac-cookie-timeout=3d on-login={ros_quote(KICK_OTHERS)}",
        ]
    # No hotspot sharing: packets to customers leave with TTL 1, so a phone cannot pass the connection on.
    out += [
        ':do { :local hif [/ip hotspot get [:pick [/ip hotspot find] 0] interface]; :if ([:len [/ip firewall mangle find where comment="Juthelink: no hotspot sharing"]] = 0) do={ /ip firewall mangle add chain=postrouting out-interface=$hif action=change-ttl new-ttl=set:1 passthrough=yes comment="Juthelink: no hotspot sharing" } } on-error={ :put "Could not add the no-sharing rule: is the hotspot set up?" }',
        ':put "Juthelink sync installed: logins every 10 s, device report every 30 s, speed tiers, no hotspot sharing"',
        "",
    ]
    path = Path(__file__).with_name("juthelink-sync.rsc")
    path.write_text("\n".join(out), encoding="ascii")
    print(f"wrote {path}")
    # Point the router pages at the website.
    for page in ("login.html", "status.html"):
        f = Path(__file__).with_name("hotspot") / page
        html = f.read_text(encoding="utf-8")
        html = re.sub(r'var PORTAL="[^"]*"', f'var PORTAL="{base}"', html)
        f.write_text(html, encoding="utf-8")
        print(f"updated {f} (website {base})")


if __name__ == "__main__":
    main()
