# Вирізання іконок дороги/села/замку з 4 кольорових сприт-листів (LockBits, без обрізки)
# A=дорога, B=село(дом), C=замок(місто). Фон чорний -> прозорий flood-fill'ом від країв.
Add-Type -AssemblyName System.Drawing

$pf=[System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$dir='c:\Users\Admin\Desktop\Projects\Colonization\assets\textures\markers\'

$files=@(
  @('06fa28ac-6392-4866-a525-0d1c84be0811','red'),
  @('8a4718b5-008d-4107-b7c4-85008d6adf81','blue'),
  @('3dd2b9ff-dcc2-446a-a5da-a87c4dff8e3e','yellow'),
  @('ddc165cc-0416-439c-ac8b-8930c768c127','green')
)
$kinds=@(
  @('road',123,497,450,598),
  @('house',613,909,355,682),
  @('castle',1071,1392,374,681)
)

foreach($fe in $files){
  $file=$fe[0]; $color=$fe[1]
  $b=[System.Drawing.Bitmap]::FromFile($dir+$file+'.png')
  foreach($kd in $kinds){
    $kind=$kd[0]; $x0=[int]$kd[1]; $x1=[int]$kd[2]; $y0=[int]$kd[3]; $y1=[int]$kd[4]
    $w=$x1-$x0; $h=$y1-$y0
    $rc=New-Object System.Drawing.Rectangle($x0,$y0,$w,$h)
    $crop=$b.Clone($rc,$pf)
    $rect=New-Object System.Drawing.Rectangle(0,0,$w,$h)
    $data=$crop.LockBits($rect,[System.Drawing.Imaging.ImageLockMode]::ReadWrite,$pf)
    $stride=$data.Stride
    $pix=New-Object byte[] ($stride*$h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0,$pix,0,$pix.Length)
    $vis=New-Object byte[] ($w*$h); $isB=New-Object bool[] ($w*$h)
    $q=New-Object 'System.Collections.Generic.Queue[int]'
    for($i=0;$i -lt $w;$i++){ $q.Enqueue($i);$q.Enqueue(0);$q.Enqueue($i);$q.Enqueue($h-1) }
    for($j=0;$j -lt $h;$j++){ $q.Enqueue(0);$q.Enqueue($j);$q.Enqueue($w-1);$q.Enqueue($j) }
    while($q.Count -gt 0){
      $x=$q.Dequeue(); $y=$q.Dequeue()
      if($x -lt 0 -or $y -lt 0 -or $x -ge $w -or $y -ge $h){ continue }
      $idx=$y*$w+$x; if($vis[$idx] -eq 1){ continue }
      $o=$y*$stride+$x*4
      if([int]$pix[$o] -gt 70 -or [int]$pix[$o+1] -gt 70 -or [int]$pix[$o+2] -gt 70){ continue }
      $vis[$idx]=1; $isB[$idx]=$true
      $q.Enqueue($x+1);$q.Enqueue($y);$q.Enqueue($x-1);$q.Enqueue($y);$q.Enqueue($x);$q.Enqueue($y+1);$q.Enqueue($x);$q.Enqueue($y-1)
    }
    for($y=0;$y -lt $h;$y++){ for($x=0;$x -lt $w;$x++){ if($isB[$y*$w+$x]){ $o=$y*$stride+$x*4; $pix[$o]=0;$pix[$o+1]=0;$pix[$o+2]=0;$pix[$o+3]=0 } } }
    [System.Runtime.InteropServices.Marshal]::Copy($pix,0,$data.Scan0,$pix.Length)
    $crop.UnlockBits($data)
    $out=$dir+'tex-'+$kind+'-'+$color+'.png'
    $crop.Save($out)
    $chk=[System.Drawing.Bitmap]::FromFile($out)
    Write-Output ($color+' '+$kind+' -> '+$chk.Width+'x'+$chk.Height+' topA='+$chk.GetPixel([int]($w/2),0).A)
    $chk.Dispose(); $crop.Dispose()
  }
  $b.Dispose()
}
Write-Output 'DONE'