import os,re
p='android/app/build.gradle'
s=open(p).read()
run=os.environ.get('GITHUB_RUN_NUMBER','1')
s,n1=re.subn(r'versionCode\s+\d+','versionCode '+run,s,count=1)
s,n2=re.subn(r'versionName\s+"[^"]*"','versionName "1.'+run+'"',s,count=1)
ks=os.path.abspath('keystore/debug.keystore')
block="""
    signingConfigs {
        fiere {
            storeFile file('%s')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.fiere
        }""" % ks
s,n3=re.subn(r'\n\s*buildTypes\s*\{',lambda m:block,s,count=1)
assert n1 and n2 and n3,(n1,n2,n3)
open(p,'w').write(s)
print('patched versionCode',run)
