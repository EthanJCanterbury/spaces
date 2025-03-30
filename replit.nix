
{ pkgs }: { deps = [
  pkgs.nano
  pkgs.lsof
  pkgs.postgresql_12
  pkgs.python311Full
  pkgs.python311Packages.pip
  pkgs.python311.pkgs.setuptools
  pkgs.python311.pkgs.wheel
 ]; }
