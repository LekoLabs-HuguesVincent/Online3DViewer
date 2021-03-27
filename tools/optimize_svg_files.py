import os
import sys
import subprocess
import json

from lib import tools_lib as Tools

def Main (argv):
	currentDir = os.path.dirname (os.path.abspath (__file__))
	os.chdir (currentDir)
	imagesPath = os.path.abspath (os.path.join ('..', 'website', 'assets', 'images'))
	for i in range (0, 5):
		Tools.RunCommand (['svgo', '-r', imagesPath])

sys.exit (Main (sys.argv))
