"""Make an editable single-variant review scene using the verified master assembler."""
import sys,json
from pathlib import Path
# Execute assembler with an in-memory source adaptation; never rewrite catalog or original master.
P=Path.cwd()/'prototypes/hero-garage'
args=sys.argv[sys.argv.index('--')+1:];assert len(args)==2,'Expected rider-file bike-file, relative to assets/'
rider,bike=args;slug=Path(rider).stem
catalog=json.loads((P/'public/assets/catalog.json').read_text())
for row in catalog['assets']:
 filename=rider if row['kind']=='rider' else bike
 row['url']=row['mobileUrl']='/assets/'+filename
 row['label']=Path(filename).stem.replace('-',' ')
 row['id']=Path(filename).stem
source=(P/'art/delivery/build_master.py').read_text()
source=source.replace("catalog=json.loads((P/'public/assets/catalog.json').read_text());records=[]",'catalog='+repr(catalog)+';records=[]')
source=source.replace("out=D/'hero-garage-master.blend'", "out=D/"+repr(slug+'-master.blend'))
source=source.replace("'catalogSHA256':hashlib.sha256((P/'public/assets/catalog.json').read_bytes()).hexdigest()", "'variantCatalog':catalog")
source=source.replace("P/'reports/delivery-master.json'", "P/"+repr('reports/'+slug+'-master.json'))
exec(compile(source,str(P/'art/delivery/build_master.py'),'exec'))
